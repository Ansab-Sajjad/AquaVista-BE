import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { PinnedItem } from "../models/PinnedItem.model";
import { Chat } from "../models/Chat.model";
import { AppError } from "../middleware/errorHandler";

// GET /api/projects/:projectId/dashboard
export async function listPinnedItems(req: AuthRequest, res: Response) {
  const items = await PinnedItem.find({ project: req.params.projectId })
    .populate("pinnedBy", "name")
    .sort({ createdAt: -1 });

  res.json(
    items.map((item) => ({
      id: item._id,
      type: item.type,
      title: item.title,
      sourceQuestion: item.sourceQuestion,
      content: item.content,
      tableData: item.tableData,
      chartData: item.chartData,
      createdBy: (item.pinnedBy as unknown as { name: string })?.name || "Unknown",
      createdAt: item.createdAt,
      sourceChat: item.sourceChat,
    }))
  );
}

// POST /api/projects/:projectId/dashboard/pin
export async function pinItem(req: AuthRequest, res: Response) {
  const { chatId, messageIndex, title, type, sourceQuestion, content, tableData, chartData } =
    req.body;

  // Validate the source chat belongs to this project
  const chat = await Chat.findOne({
    _id: chatId,
    project: req.params.projectId,
  });
  if (!chat) throw new AppError("Source chat not found in this project", 404);

  const pinned = await PinnedItem.create({
    project: req.params.projectId,
    pinnedBy: req.user!.id,
    sourceChat: chatId,
    title: title || "Pinned insight",
    type: type || "narrative",
    sourceQuestion,
    content,
    tableData: tableData || undefined,
    chartData: chartData || undefined,
  });

  res.status(201).json({
    id: pinned._id,
    type: pinned.type,
    title: pinned.title,
    sourceQuestion: pinned.sourceQuestion,
    content: pinned.content,
    createdAt: pinned.createdAt,
  });
}

// DELETE /api/projects/:projectId/dashboard/:itemId
export async function unpinItem(req: AuthRequest, res: Response) {
  const item = await PinnedItem.findOne({
    _id: req.params.itemId,
    project: req.params.projectId,
  });

  if (!item) throw new AppError("Pinned item not found", 404);
  await item.deleteOne();

  res.json({ message: "Item unpinned." });
}
