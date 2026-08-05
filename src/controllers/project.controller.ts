import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { Project } from "../models/Project.model";
import { DataFile } from "../models/DataFile.model";
import { AppError } from "../middleware/errorHandler";
import { createNotification } from "../services/notification.service";
import mongoose from "mongoose";
import logger from "../config/logger";

// GET /api/projects
export async function listProjects(req: AuthRequest, res: Response) {
  const query =
    req.user!.role === "admin"
      ? {}
      : { "members.user": req.user!.id };

  const projects = await Project.find(query)
    .populate("createdBy", "name email")
    .sort({ updatedAt: -1 });

  const projectIds = projects.map((p) => p._id);
  const fileCounts = await DataFile.aggregate([
    { $match: { project: { $in: projectIds } } },
    { $group: { _id: "$project", count: { $sum: 1 } } },
  ]);
  const fileCountMap = new Map(
    fileCounts.map((entry) => [String(entry._id), entry.count])
  );

  // Attach member/file counts instead of raw arrays
  const result = projects.map((p) => ({
    id: p._id,
    name: p.name,
    municipality: p.municipality,
    description: p.description,
    notes: p.notes,
    teamCount: p.members.length,
    fileCount: fileCountMap.get(String(p._id)) ?? 0,
    lastUpdated: p.updatedAt,
    createdBy: p.createdBy,
  }));

  res.json(result);
}

// POST /api/projects
export async function createProject(req: AuthRequest, res: Response) {
  const { name, municipality, description, notes } = req.body;

  const project = await Project.create({
    name,
    municipality,
    description,
    notes,
    createdBy: req.user!.id,
    members: [],
  });

  // Notify the creator
  try {
    await createNotification({
      recipient: new mongoose.Types.ObjectId(req.user!.id),
      type: "system",
      category: "project_created",
      title: `Project created: ${project.name}`,
      message: `Your project "${project.name}" for ${project.municipality} has been created successfully.`,
      projectId: project._id,
    });
  } catch (err) {
    logger.error("Failed to send project_created notification", {
      error: err instanceof Error ? err.message : err,
    });
  }

  res.status(201).json({
    id: project._id,
    name: project.name,
    municipality: project.municipality,
    description: project.description,
    teamCount: 0,
    lastUpdated: project.updatedAt,
  });
}

// GET /api/projects/:projectId
export async function getProject(req: AuthRequest, res: Response) {
  const project = await Project.findById(req.params.projectId).populate(
    "createdBy",
    "name email"
  );
  if (!project) throw new AppError("Project not found", 404);

  res.json({
    id: project._id,
    name: project.name,
    municipality: project.municipality,
    description: project.description,
    notes: project.notes,
    teamCount: project.members.length,
    lastUpdated: project.updatedAt,
    createdBy: project.createdBy,
    dailyQuestionLimit: project.dailyQuestionLimit,
  });
}
