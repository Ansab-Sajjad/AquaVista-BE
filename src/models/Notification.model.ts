import mongoose, { Document, Schema } from "mongoose";

export type NotificationCategory =
  | "file_upload_complete"
  | "file_upload_failed"
  | "member_added"
  | "member_removed"
  | "project_created";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  actor?: mongoose.Types.ObjectId;
  type: "system" | "user";
  category: NotificationCategory;
  title: string;
  message: string;
  isRead: boolean;
  href?: string;
  projectId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, enum: ["system", "user"], required: true },
    category: {
      type: String,
      enum: [
        "file_upload_complete",
        "file_upload_failed",
        "member_added",
        "member_removed",
        "project_created",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
    href: { type: String, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
  },
  { timestamps: true }
);

// Efficient per-user listing ordered by recency
NotificationSchema.index({ recipient: 1, createdAt: -1 });

// Fast unread-count queries
NotificationSchema.index({ recipient: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
