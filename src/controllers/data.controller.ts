import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth.middleware";
import { DataFile, DATA_FILE_TYPES } from "../models/DataFile.model";
import { DocumentTemplate } from "../models/DocumentTemplate.model";
import { AppError } from "../middleware/errorHandler";
import { extractTextFromFile } from "../services/document-extractor.service";
import {
  parseStructuredFile,
  storeDataRecords,
  deleteDataRecords,
  isStructuredFile,
} from "../services/structured-parser.service";
import {
  storeDocumentChunks,
  deleteDocumentChunks,
} from "../services/embedding.service";
import { createNotification } from "../services/notification.service";
import { invalidateProjectDataContext } from "../services/data-context.service";
import { Project } from "../models/Project.model";
import logger from "../config/logger";

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
    name: req.file.originalname,
    originalName: req.file.originalname,
    fileType,
    year: year || undefined,
    notes: notes || undefined,
    uploadedBy: req.user!.id,
    fileData: req.file.buffer,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    status: "processing",
  });

  // Log upload activity immediately — fan out a file_uploaded notification to
  // every project member so the upload shows up in the activity feed right away
  // (before async text extraction completes).
  try {
    const project = await Project.findById(req.params.projectId);
    if (project) {
      await Promise.all(
        project.members.map((m) =>
          createNotification({
            recipient: m.user,
            actor: new mongoose.Types.ObjectId(req.user!.id),
            type: "system",
            category: "file_uploaded",
            title: `File uploaded: ${req.file!.originalname}`,
            message: `${req.file!.originalname} (${fileType}) was uploaded to ${project.name} and is being processed.`,
            projectId: project._id,
            href: `/projects/${project._id}/data`,
          })
        )
      );
    }
  } catch (notifErr) {
    logger.error("Failed to send file_uploaded notifications", {
      fileId: dataFile._id,
      error: notifErr instanceof Error ? notifErr.message : notifErr,
    });
  }

  // Extract text content from uploaded file asynchronously
  extractAndStoreContent(dataFile._id.toString(), req.file.buffer, req.file.mimetype)
    .catch((err) => logger.error("Background extraction failed", {
      fileId: dataFile._id,
      error: err instanceof Error ? err.message : err,
    }));

  const { User } = await import("../models/User.model");
  const user = await User.findById(req.user!.id);

  res.status(201).json({
    id: dataFile._id,
    name: dataFile.originalName,
    fileType: dataFile.fileType,
    year: dataFile.year,
    status: dataFile.status,
    uploadedAt: dataFile.createdAt,
    uploadedBy: user?.name || "User",
    sizeBytes: dataFile.sizeBytes,
  });
}

// GET /api/projects/:projectId/data/:fileId/download
export async function downloadDataFile(req: AuthRequest, res: Response) {
  const file = await DataFile.findOne({
    _id: req.params.fileId,
    project: req.params.projectId,
  }).select("+fileData");

  if (!file) throw new AppError("File not found", 404);
  if (!file.fileData) {
    throw new AppError("File is no longer available for download", 404);
  }

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(file.originalName)}"`
  );
  res.setHeader("Content-Length", file.sizeBytes.toString());
  res.send(file.fileData);
}

// GET /api/projects/:projectId/data/:fileId/preview
// Sends the file inline (Content-Disposition: inline) so the browser can
// render it in an iframe/embed instead of forcing a download.
export async function previewDataFile(req: AuthRequest, res: Response) {
  const file = await DataFile.findOne({
    _id: req.params.fileId,
    project: req.params.projectId,
  }).select("+fileData");

  if (!file) throw new AppError("File not found", 404);
  if (!file.fileData) {
    throw new AppError("File is no longer available for preview", 404);
  }

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(file.originalName)}"`
  );
  res.setHeader("Content-Length", file.sizeBytes.toString());
  res.send(file.fileData);
}

// DELETE /api/projects/:projectId/data/:fileId
export async function deleteDataFile(req: AuthRequest, res: Response) {
  const file = await DataFile.findOne({
    _id: req.params.fileId,
    project: req.params.projectId,
  });

  if (!file) throw new AppError("File not found", 404);

  await file.deleteOne();

  // Clean up associated DataRecords (structured file rows)
  await deleteDataRecords(req.params.fileId).catch((err) =>
    logger.warn("Failed to delete DataRecords for deleted file", {
      fileId: req.params.fileId,
      error: err instanceof Error ? err.message : err,
    })
  );

  // Clean up associated DocumentChunks (PDF embeddings)
  await deleteDocumentChunks(req.params.fileId).catch((err) =>
    logger.warn("Failed to delete DocumentChunks for deleted file", {
      fileId: req.params.fileId,
      error: err instanceof Error ? err.message : err,
    })
  );

  // Invalidate AVA data context cache since the file set changed
  await invalidateProjectDataContext(req.params.projectId).catch((err) =>
    logger.warn("Failed to invalidate AVA context cache after file deletion", {
      fileId: req.params.fileId,
      error: err instanceof Error ? err.message : err,
    })
  );

  res.json({ message: "File deleted." });
}

// GET /api/projects/:projectId/templates
export async function listTemplates(_req: AuthRequest, res: Response) {
  const templates = await DocumentTemplate.find().select("-fileData").sort({ name: 1 });

  res.json(
    templates.map((t) => ({
      id: t._id,
      name: t.name,
      description: t.description,
      fileType: t.fileType,
      originalName: t.originalName,
      sizeBytes: t.sizeBytes,
      mimeType: t.mimeType,
    }))
  );
}

// GET /api/projects/:projectId/templates/:templateId/download
export async function downloadTemplate(req: AuthRequest, res: Response) {
  const template = await DocumentTemplate.findById(req.params.templateId);

  if (!template) {
    throw new AppError("Template not found", 404);
  }

  res.setHeader("Content-Type", template.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(template.originalName)}"`
  );
  res.setHeader("Content-Length", template.sizeBytes.toString());

  res.send(template.fileData);
}

/**
 * Extracts text content from an uploaded file and stores it in the DataFile record.
 * Called asynchronously after file upload.
 * On completion or failure, fans out a notification to every project member.
 */
async function extractAndStoreContent(
  fileId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  let originalName = "";
  let projectId: import("mongoose").Types.ObjectId | undefined;

  try {
    const file = await DataFile.findById(fileId);
    originalName = file?.originalName ?? "file";
    projectId = file?.project as import("mongoose").Types.ObjectId | undefined;

    const extractedText = await extractTextFromFile(fileBuffer, mimeType);
    await DataFile.findByIdAndUpdate(fileId, {
      extractedText,
      extractedAt: new Date(),
      status: "Completed",
    });
    logger.info(`Text extraction completed for file ${fileId}, ${extractedText.length} chars`);

    // For structured files (Excel/CSV), also parse into DataRecord rows
    // for tool-based querying by AVA
    if (isStructuredFile(mimeType) && projectId) {
      try {
        const parsed = await parseStructuredFile(fileBuffer, mimeType);
        const rowCount = await storeDataRecords(
          projectId.toString(),
          fileId,
          file!.fileType,
          file!.year,
          parsed
        );
        logger.info(`Structured parsing completed for file ${fileId}, ${rowCount} rows stored`);
      } catch (parseErr) {
        logger.error("Structured parsing failed (text extraction still succeeded)", {
          fileId,
          error: parseErr instanceof Error ? parseErr.message : parseErr,
        });
      }
    }

    // For PDF files, chunk and embed the text for semantic search (RAG)
    if (mimeType === "application/pdf" && projectId) {
      try {
        const chunkCount = await storeDocumentChunks(
          projectId.toString(),
          fileId,
          file!.fileType,
          file!.year,
          file!.originalName,
          extractedText
        );
        logger.info(`PDF embedding completed for file ${fileId}, ${chunkCount} chunks stored`);
      } catch (embedErr) {
        logger.error("PDF embedding failed (text extraction still succeeded)", {
          fileId,
          error: embedErr instanceof Error ? embedErr.message : embedErr,
        });
      }
    }

    // Invalidate AVA data context cache — the file's updatedAt changed,
    // so the hash will differ on next query and trigger a rebuild.
    // This eager invalidation ensures the cache is cleared immediately
    // rather than relying solely on the hash check.
    if (projectId) {
      await invalidateProjectDataContext(projectId.toString()).catch((err) =>
        logger.warn("Failed to invalidate AVA context cache after extraction", {
          fileId,
          error: err instanceof Error ? err.message : err,
        })
      );
    }

    // Fan out file_upload_complete notifications to all project members
    if (projectId) {
      try {
        const project = await Project.findById(projectId);
        if (project) {
          await Promise.all(
            project.members.map((m) =>
              createNotification({
                recipient: m.user,
                type: "system",
                category: "file_upload_complete",
                title: `File processed: ${originalName}`,
                message: `The file "${originalName}" has been processed successfully and is now available for analysis.`,
                projectId,
              })
            )
          );
        }
      } catch (notifErr) {
        logger.error("Failed to send file_upload_complete notifications", {
          fileId,
          error: notifErr instanceof Error ? notifErr.message : notifErr,
        });
      }
    }
  } catch (err) {
    logger.error("Text extraction failed", {
      fileId,
      error: err instanceof Error ? err.message : err,
    });
    await DataFile.findByIdAndUpdate(fileId, { status: "Failed" });

    // Fan out file_upload_failed notifications to all project members
    if (projectId) {
      try {
        const project = await Project.findById(projectId);
        if (project) {
          await Promise.all(
            project.members.map((m) =>
              createNotification({
                recipient: m.user,
                type: "system",
                category: "file_upload_failed",
                title: `File processing failed: ${originalName}`,
                message: `The file "${originalName}" could not be processed. Please try re-uploading the file.`,
                projectId,
              })
            )
          );
        }
      } catch (notifErr) {
        logger.error("Failed to send file_upload_failed notifications", {
          fileId,
          error: notifErr instanceof Error ? notifErr.message : notifErr,
        });
      }
    }

    throw err;
  }
}
