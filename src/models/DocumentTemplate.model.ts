import mongoose, { Document, Schema } from "mongoose";

export interface IDocumentTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  fileType: string;
  description: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  fileData: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentTemplateSchema = new Schema<IDocumentTemplate>(
  {
    name: { type: String, required: true, trim: true },
    fileType: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    fileData: { type: Buffer, required: true },
  },
  { timestamps: true }
);

export const DocumentTemplate = mongoose.model<IDocumentTemplate>(
  "DocumentTemplate",
  DocumentTemplateSchema
);
