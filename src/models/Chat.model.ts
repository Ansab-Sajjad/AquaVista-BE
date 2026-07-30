import mongoose, { Document, Schema } from "mongoose";

export type MessageRole = "user" | "assistant";
export type MessageType = "narrative" | "table" | "chart";

export interface IMessage {
  role: MessageRole;
  content: string;
  type?: MessageType;
  title?: string;
  chartData?: Record<string, unknown>;
  tableData?: Record<string, unknown>[];
  inputTokens?: number;
  outputTokens?: number;
  createdAt: Date;
}

export interface IChat extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  title: string;
  messages: IMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ["narrative", "table", "chart"] },
    title: { type: String },
    chartData: { type: Schema.Types.Mixed },
    tableData: { type: [Schema.Types.Mixed] },
    inputTokens: { type: Number },
    outputTokens: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ChatSchema = new Schema<IChat>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "New conversation" },
    messages: { type: [MessageSchema], default: [] },
    totalInputTokens: { type: Number, default: 0 },
    totalOutputTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ChatSchema.index({ project: 1, user: 1 });

export const Chat = mongoose.model<IChat>("Chat", ChatSchema);
