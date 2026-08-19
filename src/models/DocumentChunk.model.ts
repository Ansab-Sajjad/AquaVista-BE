import mongoose, { Document, Schema } from "mongoose";

export interface IDocumentChunk extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  file: mongoose.Types.ObjectId;
  fileType: string;
  year?: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

const DocumentChunkSchema = new Schema<IDocumentChunk>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    file: { type: Schema.Types.ObjectId, ref: "DataFile", required: true },
    fileType: { type: String, required: true },
    year: { type: String },
    fileName: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

// Indexes for efficient querying
DocumentChunkSchema.index({ project: 1, file: 1, chunkIndex: 1 });
DocumentChunkSchema.index({ project: 1, fileType: 1 });

export const DocumentChunk = mongoose.model<IDocumentChunk>(
  "DocumentChunk",
  DocumentChunkSchema
);
