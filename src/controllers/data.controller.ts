import { Response } from "express";
import fs from "fs";
import path from "path";
import { AuthRequest } from "../middleware/auth.middleware";
import { DataFile, DATA_FILE_TYPES } from "../models/DataFile.model";
import { AppError } from "../middleware/errorHandler";

// GET /api/projects/:projectId/data
export async function listDataFiles(req: AuthRequest, res: Response) {
  const files = await DataFile.find({ project: req.params.projectId })
    .populate("uploadedBy", "name")
    .sort({ createdAt: -1 });

  res.json(
    files.map((f) => ({
      id: f._id,
      name: f.originalName,
      fileType: f.fileType,
      year: f.year,
      notes: f.notes,
      uploadedBy: (f.uploadedBy as unknown as { name: string })?.name || "Unknown",
      uploadedAt: f.createdAt,
      status: f.status,
      sizeBytes: f.sizeBytes,
    }))
  );
}

// POST /api/projects/:projectId/data
export async function uploadDataFile(req: AuthRequest, res: Response) {
  if (!req.file) throw new AppError("No file uploaded", 400);

  const { fileType, year, notes } = req.body;

  if (!DATA_FILE_TYPES.includes(fileType)) {
    throw new AppError(`Invalid file type. Must be one of: ${DATA_FILE_TYPES.join(", ")}`, 400);
  }

  const dataFile = await DataFile.create({
    project: req.params.projectId,
    name: req.file.filename,
    originalName: req.file.originalname,
    fileType,
    year: year || undefined,
    notes: notes || undefined,
    uploadedBy: req.user!.id,
    storagePath: req.file.path,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    status: "processing",
  });

  // Simulate async processing (replace with real parsing pipeline)
  setTimeout(async () => {
    await DataFile.findByIdAndUpdate(dataFile._id, { status: "completed" });
  }, 2000);

  res.status(201).json({
    id: dataFile._id,
    name: dataFile.originalName,
    fileType: dataFile.fileType,
    year: dataFile.year,
    status: dataFile.status,
    uploadedAt: dataFile.createdAt,
  });
}

// GET /api/projects/:projectId/data/:fileId/download
export async function downloadDataFile(req: AuthRequest, res: Response) {
  const file = await DataFile.findOne({
    _id: req.params.fileId,
    project: req.params.projectId,
  });

  if (!file) throw new AppError("File not found", 404);
  if (!fs.existsSync(file.storagePath)) {
    throw new AppError("File is no longer available for download", 404);
  }

  res.download(path.resolve(file.storagePath), file.originalName);
}

// DELETE /api/projects/:projectId/data/:fileId
export async function deleteDataFile(req: AuthRequest, res: Response) {
  const file = await DataFile.findOne({
    _id: req.params.fileId,
    project: req.params.projectId,
  });

  if (!file) throw new AppError("File not found", 404);

  // Remove from disk
  if (fs.existsSync(file.storagePath)) {
    fs.unlinkSync(file.storagePath);
  }

  await file.deleteOne();
  res.json({ message: "File deleted." });
}

// GET /api/templates — static list of downloadable templates
export async function listTemplates(_req: AuthRequest, res: Response) {
  const templates = [
    {
      id: "financial-snapshot",
      name: "Financial Snapshot Template",
      description: "Standard municipal financial snapshot layout with all required columns.",
      fileType: "xlsx",
      downloadUrl: "/templates/financial-snapshot-template.xlsx",
    },
    {
      id: "customer-allocation",
      name: "Customer Allocation Template",
      description: "Revenue and consumption by customer class and year.",
      fileType: "xlsx",
      downloadUrl: "/templates/customer-allocation-template.xlsx",
    },
    {
      id: "cip-register",
      name: "CIP Register Template",
      description: "Capital improvement plan register with required fields.",
      fileType: "xlsx",
      downloadUrl: "/templates/cip-register-template.xlsx",
    },
    {
      id: "rate-table",
      name: "Rate Table Template",
      description: "Existing rate structure, tiers, and base charges.",
      fileType: "xlsx",
      downloadUrl: "/templates/rate-table-template.xlsx",
    },
    {
      id: "demographics",
      name: "Demographics Template",
      description: "Population, household, and median income data by year.",
      fileType: "xlsx",
      downloadUrl: "/templates/demographics-template.xlsx",
    },
  ];

  res.json(templates);
}

// GET /api/templates/:templateId/download
export async function downloadTemplate(req: AuthRequest, res: Response) {
  const templateFile = path.join(
    __dirname,
    "../../templates",
    `${req.params.templateId}-template.xlsx`
  );

  if (!fs.existsSync(templateFile)) {
    throw new AppError("Template not found", 404);
  }

  res.download(templateFile);
}
