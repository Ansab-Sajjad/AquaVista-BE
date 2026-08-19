import mongoose, { Document, Schema } from "mongoose";

export interface IProjectMember {
  user: mongoose.Types.ObjectId;
  addedAt: Date;
}

export interface IAvaContextCache {
  context: string;
  fileHash: string;
  builtAt: Date;
}

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  municipality: string;
  description?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  members: IProjectMember[];
  dailyQuestionLimit: number;
  avaContextCache?: IAvaContextCache | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectMemberSchema = new Schema<IProjectMember>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    municipality: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: { type: [ProjectMemberSchema], default: [] },
    dailyQuestionLimit: {
      type: Number,
      default: parseInt(process.env.DEFAULT_DAILY_QUESTION_LIMIT || "100", 10),
    },
    avaContextCache: {
      context: { type: String },
      fileHash: { type: String },
      builtAt: { type: Date },
    },
  },
  { timestamps: true }
);

export const Project = mongoose.model<IProject>("Project", ProjectSchema);
