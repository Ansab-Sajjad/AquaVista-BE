import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth.middleware";
import { Notification } from "../models/Notification.model";
import { AppError } from "../middleware/errorHandler";

// GET /api/notifications
export async function getNotifications(req: AuthRequest, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const notifications = await Notification.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("actor", "name profileImage");

  const result = notifications.map((n) => {
    const actor = n.actor
      ? (() => {
          const a = n.actor as unknown as {
            _id: mongoose.Types.ObjectId;
            name: string;
            profileImage?: string;
          };
          return { id: a._id, name: a.name, profileImage: a.profileImage || null };
        })()
      : null;

    return {
      id: n._id,
      type: n.type,
      category: n.category,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      href: n.href || null,
      actor,
      createdAt: n.createdAt,
    };
  });

  res.json(result);
}

// PATCH /api/notifications/:id/read
export async function markAsRead(req: AuthRequest, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const notificationId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new AppError("Invalid notification ID", 400);
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  res.json({ id: notification._id, isRead: notification.isRead });
}

// PATCH /api/notifications/read-all
export async function markAllAsRead(req: AuthRequest, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  await Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true });

  res.json({ message: "All notifications marked as read." });
}
