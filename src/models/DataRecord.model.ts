import mongoose, { Document, Schema } from "mongoose";

export interface IDataRecord extends Document {
  _id: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  file: mongoose.Types.ObjectId;
  fileType: string;
  year?: string;
  sheetName?: string;
  rowNumber: number;
  columns: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const DataRecordSchema = new Schema<IDataRecord>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    file: { type: Schema.Types.ObjectId, ref: "DataFile", required: true },
    fileType: { type: String, required: true },
    year: { type: String },
    sheetName: { type: String },
    rowNumber: { type: Number, required: true },
    columns: {
      type: Map,
      of: String,
      required: true,
      default: new Map(),
    },
  },
  { timestamps: true }
);

// Query indexes — cover the common tool query patterns
DataRecordSchema.index({ project: 1, fileType: 1, year: 1 });
DataRecordSchema.index({ file: 1 });

export const DataRecord = mongoose.model<IDataRecord>("DataRecord", DataRecordSchema);
