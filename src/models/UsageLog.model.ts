import mongoose, { Document, Schema } from "mongoose";

export interface IUsageLog extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  questionCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  updatedAt: Date;
}

const UsageLogSchema = new Schema<IUsageLog>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    questionCount: { type: Number, default: 0 },
    totalInputTokens: { type: Number, default: 0 },
    totalOutputTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One record per project+user+day
UsageLogSchema.index({ project: 1, user: 1, date: 1 }, { unique: true });

export const UsageLog = mongoose.model<IUsageLog>("UsageLog", UsageLogSchema);
