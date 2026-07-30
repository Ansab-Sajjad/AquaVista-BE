import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { Project } from "../models/Project.model";
import { AppError } from "../middleware/errorHandler";

// GET /api/projects
export async function listProjects(req: AuthRequest, res: Response) {
  const query =
    req.user!.role === "admin"
      ? {}
      : { "members.user": req.user!.id };

  const projects = await Project.find(query)
    .populate("createdBy", "name email")
    .sort({ updatedAt: -1 });

  // Attach member count instead of raw members array
  const result = projects.map((p) => ({
    id: p._id,
    name: p.name,
    municipality: p.municipality,
    description: p.description,
    notes: p.notes,
    teamCount: p.members.length,
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
