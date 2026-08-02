import mongoose, { Document, Schema } from "mongoose";

export type FileStatus = "Processing" | "Completed" | "Failed" | "processing" | "completed";

export const DATA_FILE_TYPES = [
  "Financial Snapshot",
  "Customer Allocation / Billing Data",
  "CIP Register",
  "Rate Table",
  "Demographics",
  "Budget / Audit Data",
  "Rate Resolution",
] as const;

export type DataFileType = (typeof DATA_FILE_TYPES)[number];

export interface IDataFile extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  name: string;
  originalName: string;
  fileType: DataFileType;
  year?: string;
  notes?: string;
  uploadedBy: mongoose.Types.ObjectId;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  extractedText: string;
  extractedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DataFileSchema = new Schema<IDataFile>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    fileType: { type: String, enum: DATA_FILE_TYPES, required: true },
    year: { type: String, trim: true },
    notes: { type: String, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    status: {
      type: String,
      enum: ["Processing", "Completed", "Failed", "processing", "completed"],
      default: "processing",
    },
    extractedText: { type: String, default: "" },
    extractedAt: { type: Date },
  },
  { timestamps: true }
);

DataFileSchema.index({ project: 1, fileType: 1 });

export const DataFile = mongoose.model<IDataFile>("DataFile", DataFileSchema);
