import mongoose, { Document, Schema } from "mongoose";

export interface IStartupQuestion extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  text: string;
  order: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StartupQuestionSchema = new Schema<IStartupQuestion>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    text: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

StartupQuestionSchema.index({ project: 1, order: 1 });

export const StartupQuestion = mongoose.model<IStartupQuestion>(
  "StartupQuestion",
  StartupQuestionSchema
);
