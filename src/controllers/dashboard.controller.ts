import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { PinnedItem } from "../models/PinnedItem.model";
import { Chat } from "../models/Chat.model";
import { AppError } from "../middleware/errorHandler";

// GET /api/projects/:projectId/dashboard
export async function listPinnedItems(req: AuthRequest, res: Response) {
  const isAdmin = req.user!.role === "admin";

  // Global pins are visible to every project member. Private pins are only
  // visible to the user who created them. (Admin pins are always global, so
  // an admin only ever sees global pins here.)
  const visibilityFilter = isAdmin
    ? { project: req.params.projectId, scope: "global" }
    : {
        project: req.params.projectId,
        $or: [{ scope: "global" }, { scope: "private", visibleTo: req.user!.id }],
      };

  const items = await PinnedItem.find(visibilityFilter)
    .populate("pinnedBy", "name")
    .sort({ createdAt: -1 });

  res.json(
    items.map((item) => {
      const canUnpin = isAdmin || (item.scope === "private" && item.visibleTo?.toString() === req.user!.id);
      return {
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
        scope: item.scope,
        canUnpin,
      };
    })
  );
}

// POST /api/projects/:projectId/dashboard/pin
export async function pinItem(req: AuthRequest, res: Response) {
  const { chatId, messageIndex, title, type, sourceQuestion, content, tableData, chartData } =
    req.body;
  const isAdmin = req.user!.role === "admin";

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
    scope: isAdmin ? "global" : "private",
    visibleTo: isAdmin ? undefined : req.user!.id,
  });

  res.status(201).json({
    id: pinned._id,
    type: pinned.type,
    title: pinned.title,
    sourceQuestion: pinned.sourceQuestion,
    content: pinned.content,
    createdAt: pinned.createdAt,
    scope: pinned.scope,
  });
}

// DELETE /api/projects/:projectId/dashboard/:itemId
export async function unpinItem(req: AuthRequest, res: Response) {
  const isAdmin = req.user!.role === "admin";

  const item = await PinnedItem.findOne({
    _id: req.params.itemId,
    project: req.params.projectId,
  });

  if (!item) throw new AppError("Pinned item not found", 404);

  // Regular users may only remove their own private pins; global (admin)
  // pins can only be removed by admins.
  if (!isAdmin && !(item.scope === "private" && item.visibleTo?.toString() === req.user!.id)) {
    throw new AppError("You can only unpin items you pinned privately", 403);
  }

  await item.deleteOne();

  res.json({ message: "Item unpinned." });
}
