import crypto from "crypto";
import { DataFile } from "../models/DataFile.model";
import { Project } from "../models/Project.model";
import { isStructuredFile, getDataFileSchemas } from "./structured-parser.service";
import { getDocumentSummaries } from "./embedding.service";
import logger from "../config/logger";

/**
 * Cache version — bump when the context format changes to force
 * a rebuild of all cached contexts.
 */
const CACHE_VERSION = "v3-rag";

/**
 * Deterministic sort order for data files in the AVA context.
 * Groups by file type, then most recent year first, then by name.
 * This ensures the 90k-char truncation in buildDataContext drops
 * files in a predictable order rather than Mongo's natural order.
 */
const CONTEXT_SORT = { fileType: 1, year: -1, originalName: 1 } as const;

/**
 * Computes a hash from the set of completed data files for a project.
 * The hash changes whenever a file is added, deleted, or re-extracted
 * (since extraction updates `updatedAt` via Mongoose timestamps).
 * Includes the cache version so format changes force a rebuild.
 *
 * Only lightweight metadata (_id + updatedAt) is loaded — the heavy
 * `extractedText` field is NOT loaded for the hash computation.
 */
async function computeFileHash(projectId: string): Promise<string> {
  const files = await DataFile.find({
    project: projectId,
    status: { $in: ["Completed", "completed"] },
  })
    .select("_id updatedAt")
    .sort(CONTEXT_SORT)
    .lean();

  const payload = `${CACHE_VERSION}|${files
    .map((f) => `${f._id}:${f.updatedAt?.getTime() ?? 0}`)
    .join("|")}`;

  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/**
 * Builds the tool-enabled data context for a project.
 *
 * - PDF files: only a summary (file type, year, name, chunk count) is included.
 *   The AI uses the searchDocuments tool to semantically search PDF content.
 * - Excel/CSV files: only a summary (file type, year, name, columns,
 *   row count) is included. The AI uses tools to query the actual data.
 *
 * This dramatically reduces the context size — no full file content is
 * sent to the AI. Everything is retrieved on demand via tools.
 */
async function buildToolEnabledContext(projectId: string): Promise<string> {
  // Load all completed files, sorted deterministically
  const files = await DataFile.find({
    project: projectId,
    status: { $in: ["Completed", "completed"] },
  })
    .select("originalName fileType year mimeType")
    .sort(CONTEXT_SORT)
    .lean();

  if (files.length === 0) {
    return "No baseline data files have been uploaded for this project yet.";
  }

  // Separate files into unstructured (PDF) and structured (Excel/CSV)
  const pdfFiles = files.filter((f) => !isStructuredFile(f.mimeType));
  const structuredFiles = files.filter((f) => isStructuredFile(f.mimeType));

  const sections: string[] = [];

  // --- PDF files: include summary only (searchable via searchDocuments tool) ---
  if (pdfFiles.length > 0) {
    const docSummaries = await getDocumentSummaries(projectId);

    if (docSummaries.length > 0) {
      const summaryLines = docSummaries.map((s) => {
        return `- ${s.fileType}${s.year ? ` (${s.year})` : ""}: ${s.fileName} — ${s.chunkCount} chunks`;
      });

      sections.push(
        `### PDF DOCUMENTS (Rate Resolutions, Audit Narratives)\n` +
        `The following PDF documents are available. Use the searchDocuments tool to semantically search their content.\n\n` +
        summaryLines.join("\n")
      );
    } else {
      // PDFs exist but no chunks were embedded yet (embedding may have failed)
      const summaryLines = pdfFiles.map((f) => {
        return `- ${f.fileType}${f.year ? ` (${f.year})` : ""}: ${f.originalName}`;
      });
      sections.push(
        `### PDF DOCUMENTS (Rate Resolutions, Audit Narratives)\n` +
        `The following PDF documents are available but may not be fully indexed. Use the searchDocuments tool to search their content.\n\n` +
        summaryLines.join("\n")
      );
    }
  }

  // --- Structured files: include summary only ---
  if (structuredFiles.length > 0) {
    const schemas = await getDataFileSchemas(projectId);

    if (schemas.length > 0) {
      const summaryLines = schemas.map((s) => {
        const cols = s.columns.length > 0 ? s.columns.join(", ") : "(no columns)";
        return `- ${s.fileType}${s.year ? ` (${s.year})` : ""}: ${s.fileName} — ${s.rowCount} rows, columns: [${cols}]`;
      });

      sections.push(
        `### STRUCTURED DATA FILES (Excel/CSV)\n` +
        `The following structured data files are available. Use the listDataFiles and queryDataRecords tools to query their actual data.\n\n` +
        summaryLines.join("\n")
      );
    }
  }

  if (sections.length === 0) {
    return "Baseline data files have been uploaded but no text content could be extracted from them.";
  }

  const context =
    `## PROJECT BASELINE DATA\n\n` +
    `The following data is available for this project. Use the available tools to retrieve actual data:\n` +
    `- searchDocuments: semantically search PDF document content\n` +
    `- listDataFiles: list structured data file schemas\n` +
    `- queryDataRecords: query rows from structured data files\n\n` +
    sections.join("\n\n---\n\n");

  logger.debug(
    `Building tool-enabled context for project ${projectId}: ${pdfFiles.length} PDF(s), ${structuredFiles.length} structured file(s), ${context.length} chars`
  );

  return context;
}

/**
 * Returns the AVA data context for a project, using a cached version
 * on the Project document when the set of completed files hasn't changed.
 *
 * On a cache hit: only file metadata is loaded from Mongo (no extractedText).
 * On a cache miss: summaries are loaded for all files, context is rebuilt,
 * and the cache is updated.
 *
 * The cache is invalidated automatically when files are uploaded, deleted,
 * or re-extracted — any of these changes the file's `updatedAt`, which
 * changes the hash.
 */
export async function getProjectDataContext(projectId: string): Promise<string> {
  const fileHash = await computeFileHash(projectId);

  const project = await Project.findById(projectId)
    .select("avaContextCache")
    .lean();

  const cached = project?.avaContextCache;
  if (cached?.context && cached.fileHash === fileHash) {
    logger.debug(`AVA data context cache hit for project ${projectId}`);
    return cached.context;
  }

  // Cache miss — rebuild using the tool-enabled context builder
  const context = await buildToolEnabledContext(projectId);

  // Persist the rebuilt cache
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        avaContextCache: {
          context,
          fileHash,
          builtAt: new Date(),
        },
      },
    }
  );

  logger.info(
    `AVA data context rebuilt for project ${projectId} (${context.length} chars)`
  );

  return context;
}

/**
 * Clears the cached data context for a project.
 * Called when a file is uploaded or deleted to force a rebuild on next query.
 * Note: the hash-based check in getProjectDataContext already handles
 * invalidation, so this is an optional eager invalidation for immediacy.
 */
export async function invalidateProjectDataContext(
  projectId: string
): Promise<void> {
  await Project.updateOne(
    { _id: projectId },
    { $unset: { avaContextCache: "" } }
  );
  logger.debug(`AVA data context cache invalidated for project ${projectId}`);
}
