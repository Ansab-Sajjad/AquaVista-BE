import { Response } from "express";
import mongoose from "mongoose";

import { AuthRequest } from "../middleware/auth.middleware";
import { Project } from "../models/Project.model";
import { DataFile } from "../models/DataFile.model";
import { PinnedItem } from "../models/PinnedItem.model";
import { Chat } from "../models/Chat.model";
import { Notification } from "../models/Notification.model";
import { AppError } from "../middleware/errorHandler";

const TREND_DAYS = 7;

type DateBucket = { _id: string; count: number };

/**
 * Builds an array of length `TREND_DAYS` with the count per day for the last
 * `TREND_DAYS` days (oldest first). Missing days are filled with 0.
 */
function buildTrend(buckets: DateBucket[]): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const map = new Map<string, number>();
  for (const b of buckets) {
    map.set(b._id, b.count);
  }

  const result: number[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push(map.get(key) ?? 0);
  }
  return result;
}

function subDays(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * GET /api/stats/overview
 * Aggregated statistics across all projects the user can access.
 */
export async function getGlobalStats(req: AuthRequest, res: Response) {
  const isAdmin = req.user!.role === "admin";
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  // Projects the user can see
  const projectQuery = isAdmin ? {} : { "members.user": req.user!.id };
  const projects = await Project.find(projectQuery).select("_id name municipality updatedAt createdAt members").lean();
  const projectIds = projects.map((p) => p._id);

  const projectFilter = projectIds.length ? { project: { $in: projectIds } } : { project: { $exists: false } };

  // Totals
  const [dataFileCount, pinnedCount, chatCount, memberCount] = await Promise.all([
    DataFile.countDocuments(projectFilter),
    PinnedItem.countDocuments(projectFilter),
    Chat.countDocuments(projectFilter),
    Project.aggregate([
      { $match: projectQuery },
      { $project: { memberCount: { $size: "$members" } } },
      { $group: { _id: null, total: { $sum: "$memberCount" } } },
    ]),
  ]);

  // Question count = number of user messages across chats
  const questionAgg = await Chat.aggregate([
    { $match: projectFilter },
    { $unwind: "$messages" },
    { $match: { "messages.role": "user" } },
    { $count: "total" },
  ]);
  const questionCount = questionAgg[0]?.total ?? 0;

  // Trends (last 7 days)
  const [projectTrend, dataFileTrend, pinnedTrend, chatTrend] = await Promise.all([
    Project.aggregate([
      { $match: { ...projectQuery, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    DataFile.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    PinnedItem.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    Chat.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
  ]);

  // Recent activity for the user
  const notifications = await Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate("actor", "name")
    .lean();

  const recentActivity = notifications.map((n) => ({
    id: n._id,
    type: n.type,
    category: n.category,
    title: n.title,
    message: n.message,
    href: n.href || null,
    projectId: n.projectId || null,
    createdAt: n.createdAt,
    actorName: (n.actor as unknown as { name?: string } | null)?.name || null,
  }));

  // Per-project mini stats (top 6 by updatedAt)
  const projectSummaries = await Promise.all(
    projects.slice(0, 6).map(async (p) => {
      const pid = p._id;
      const [files, pinned, chats] = await Promise.all([
        DataFile.countDocuments({ project: pid }),
        PinnedItem.countDocuments({ project: pid }),
        Chat.countDocuments({ project: pid }),
      ]);
      return {
        id: pid,
        name: p.name,
        municipality: p.municipality,
        memberCount: p.members.length,
        dataFiles: files,
        pinnedItems: pinned,
        chats,
        lastUpdated: p.updatedAt,
      };
    }),
  );

  res.json({
    totals: {
      projects: projects.length,
      members: memberCount[0]?.total ?? 0,
      dataFiles: dataFileCount,
      pinnedItems: pinnedCount,
      chats: chatCount,
      questions: questionCount,
    },
    trends: {
      projects: projectTrend,
      dataFiles: dataFileTrend,
      pinnedItems: pinnedTrend,
      chats: chatTrend,
    },
    recentActivity,
    projects: projectSummaries,
  });
}

/**
 * GET /api/projects/:projectId/stats
 * Statistics scoped to a single project.
 */
export async function getProjectStats(req: AuthRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new AppError("Invalid project ID", 400);
  }

  const pid = new mongoose.Types.ObjectId(projectId);
  const projectFilter = { project: pid };

  const project = await Project.findById(pid).lean();
  if (!project) throw new AppError("Project not found", 404);

  // Totals
  const [dataFileCount, pinnedCount, chatCount, questionAgg, tokenAgg] = await Promise.all([
    DataFile.countDocuments(projectFilter),
    PinnedItem.countDocuments(projectFilter),
    Chat.countDocuments(projectFilter),
    Chat.aggregate([
      { $match: projectFilter },
      { $unwind: "$messages" },
      { $match: { "messages.role": "user" } },
      { $count: "total" },
    ]),
    Chat.aggregate([
      { $match: projectFilter },
      { $group: { _id: null, input: { $sum: "$totalInputTokens" }, output: { $sum: "$totalOutputTokens" } } },
    ]),
  ]);

  const questionCount = questionAgg[0]?.total ?? 0;
  const inputTokens = tokenAgg[0]?.input ?? 0;
  const outputTokens = tokenAgg[0]?.output ?? 0;

  // Trends (last 7 days)
  const [dataFileTrend, pinnedTrend, chatTrend, questionTrend] = await Promise.all([
    DataFile.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    PinnedItem.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    Chat.aggregate([
      { $match: { ...projectFilter, createdAt: { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
    Chat.aggregate([
      { $match: projectFilter },
      { $unwind: "$messages" },
      { $match: { "messages.role": "user", "messages.createdAt": { $gte: subDays(TREND_DAYS - 1) } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$messages.createdAt" },
          },
          count: { $sum: 1 },
        },
      },
    ]).then((r) => buildTrend(r as DateBucket[])),
  ]);

  // Data files by type
  const filesByType = await DataFile.aggregate([
    { $match: projectFilter },
    { $group: { _id: "$fileType", count: { $sum: 1 } } },
  ]);

  // Recent activity for this project (notifications for the requesting user tied to project)
  const notifications = await Notification.find({ recipient: req.user!.id, projectId: pid })
    .sort({ createdAt: -1 })
    .limit(8)
    .populate("actor", "name")
    .lean();

  const recentActivity = notifications.map((n) => ({
    id: n._id,
    type: n.type,
    category: n.category,
    title: n.title,
    message: n.message,
    href: n.href || null,
    createdAt: n.createdAt,
    actorName: (n.actor as unknown as { name?: string } | null)?.name || null,
  }));

  res.json({
    totals: {
      members: project.members.length,
      dataFiles: dataFileCount,
      pinnedItems: pinnedCount,
      chats: chatCount,
      questions: questionCount,
      inputTokens,
      outputTokens,
    },
    trends: {
      dataFiles: dataFileTrend,
      pinnedItems: pinnedTrend,
      chats: chatTrend,
      questions: questionTrend,
    },
    dataFilesByType: filesByType.map((f) => ({ type: f._id, count: f.count })),
    recentActivity,
  });
}
