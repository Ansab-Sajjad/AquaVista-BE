import mongoose, { Document, Schema } from "mongoose";

export type PinnedItemType = "narrative" | "table" | "chart";
export type PinnedItemScope = "global" | "private";

export interface IPinnedItem extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  pinnedBy: mongoose.Types.ObjectId;
  sourceChat: mongoose.Types.ObjectId;
  sourceMessage?: mongoose.Types.ObjectId;
  title: string;
  type: PinnedItemType;
  sourceQuestion: string;
  content: string;
  tableData?: Record<string, unknown>[];
  chartData?: Record<string, unknown>;
  /**
   * `global` pins (created by admins) are visible to every member of the
   * project. `private` pins (created by regular users) are only visible to
   * the user identified by `visibleTo`.
   */
  scope: PinnedItemScope;
  visibleTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PinnedItemSchema = new Schema<IPinnedItem>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    pinnedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sourceChat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    sourceMessage: { type: Schema.Types.ObjectId },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["narrative", "table", "chart"], required: true },
    sourceQuestion: { type: String, required: true },
    content: { type: String, required: true },
    tableData: { type: [Schema.Types.Mixed] },
    chartData: { type: Schema.Types.Mixed },
    scope: { type: String, enum: ["global", "private"], default: "private", required: true },
    visibleTo: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One pin per source message within a project.
PinnedItemSchema.index({ project: 1, sourceChat: 1, sourceMessage: 1 }, { unique: true, sparse: true });

export const PinnedItem = mongoose.model<IPinnedItem>("PinnedItem", PinnedItemSchema);
