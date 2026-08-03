import mongoose from "mongoose";
import { Notification, INotification, NotificationCategory } from "../models/Notification.model";

export interface CreateNotificationParams {
  recipient: mongoose.Types.ObjectId;
  type: "system" | "user";
  category: NotificationCategory;
  title: string;
  message: string;
  actor?: mongoose.Types.ObjectId;
  href?: string;
  projectId?: mongoose.Types.ObjectId;
}

/**
 * Persists a new Notification document and returns it.
 * Throws the underlying DB error on failure — callers should wrap in try/catch.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<INotification> {
  const notification = await Notification.create(params);
  return notification;
}
