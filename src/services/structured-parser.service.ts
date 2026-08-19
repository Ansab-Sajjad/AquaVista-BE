import { DataRecord } from "../models/DataRecord.model";
import { DataFile } from "../models/DataFile.model";
import logger from "../config/logger";

/**
 * MIME types that represent structured (tabular) data files.
 * These are parsed into DataRecord rows for tool-based querying.
 */
export const STRUCTURED_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
]);

export function isStructuredFile(mimeType: string): boolean {
  return STRUCTURED_MIME_TYPES.has(mimeType);
}

export interface ParsedSheet {
  sheetName: string;
  columns: string[];
  rows: Record<string, string>[];
}

export interface ParsedFile {
  sheets: ParsedSheet[];
}

/**
 * Parses an Excel (.xlsx) file buffer into structured sheets with named columns.
 * Each sheet becomes a ParsedSheet with column headers and row objects.
 */
async function parseExcelToRows(fileBuffer: Buffer): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (rows.length === 0) continue;

    const headerRow = rows[0] as string[];
    if (headerRow.length === 0) continue;

    const columns = headerRow.map((h) => String(h).trim() || `Column_${headerRow.indexOf(h) + 1}`);
    const dataRows = rows.slice(1);

    const rowObjects: Record<string, string>[] = dataRows.map((row) => {
      const obj: Record<string, string> = {};
      columns.forEach((col, i) => {
        obj[col] = String((row as unknown[])[i] ?? "").trim();
      });
      return obj;
    });

    sheets.push({ sheetName, columns, rows: rowObjects });
  }

  return { sheets };
}

/**
 * Parses a CSV file buffer into a single sheet with named columns.
 */
async function parseCsvToRows(fileBuffer: Buffer): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { sheets: [] };

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { sheets: [] };

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rows.length === 0) return { sheets: [] };

  const headerRow = rows[0] as string[];
  if (headerRow.length === 0) return { sheets: [] };

  const columns = headerRow.map((h, i) => String(h).trim() || `Column_${i + 1}`);
  const dataRows = rows.slice(1);

  const rowObjects: Record<string, string>[] = dataRows.map((row) => {
    const obj: Record<string, string> = {};
    columns.forEach((col, i) => {
      obj[col] = String((row as unknown[])[i] ?? "").trim();
    });
    return obj;
  });

  return { sheets: [{ sheetName: "CSV", columns, rows: rowObjects }] };
}

/**
 * Parses a structured file (Excel/CSV) buffer into sheets/rows.
 */
export async function parseStructuredFile(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedFile> {
  if (!fileBuffer || fileBuffer.length === 0) {
    return { sheets: [] };
  }

  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return await parseExcelToRows(fileBuffer);
    case "text/csv":
    case "application/csv":
      return await parseCsvToRows(fileBuffer);
    default:
      logger.warn(`Unsupported MIME type for structured parsing: ${mimeType}`);
      return { sheets: [] };
  }
}

/**
 * Stores parsed rows as DataRecord documents for a given file.
 * Deletes any existing DataRecords for the file first (supports re-extraction).
 */
export async function storeDataRecords(
  projectId: string,
  fileId: string,
  fileType: string,
  year: string | undefined,
  parsed: ParsedFile
): Promise<number> {
  // Clean up any existing records for this file (re-extraction case)
  await DataRecord.deleteMany({ file: fileId });

  let totalRows = 0;
  const docs: unknown[] = [];

  for (const sheet of parsed.sheets) {
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i];
      // Skip completely empty rows
      if (Object.values(row).every((v) => v === "")) continue;

      docs.push({
        project: projectId,
        file: fileId,
        fileType,
        year: year || undefined,
        sheetName: parsed.sheets.length > 1 ? sheet.sheetName : undefined,
        rowNumber: i + 1,
        columns: row,
      });
      totalRows++;
    }
  }

  if (docs.length > 0) {
    // Batch insert
    await DataRecord.insertMany(docs);
  }

  logger.info(
    `Stored ${totalRows} DataRecords for file ${fileId} (${fileType}${year ? `, ${year}` : ""})`
  );
  return totalRows;
}

/**
 * Deletes all DataRecords associated with a file.
 * Called when a file is deleted.
 */
export async function deleteDataRecords(fileId: string): Promise<void> {
  const result = await DataRecord.deleteMany({ file: fileId });
  if (result.deletedCount > 0) {
    logger.info(`Deleted ${result.deletedCount} DataRecords for file ${fileId}`);
  }
}

/**
 * Returns schema information for all structured data files in a project.
 * Used by the listDataFiles tool and for building the data context summary.
 */
export async function getDataFileSchemas(
  projectId: string
): Promise<
  Array<{
    fileId: string;
    fileName: string;
    fileType: string;
    year?: string;
    columns: string[];
    rowCount: number;
  }>
> {
  const files = await DataFile.find({
    project: projectId,
    status: { $in: ["Completed", "completed"] },
  })
    .select("_id originalName fileType year mimeType")
    .sort({ fileType: 1, year: -1, originalName: 1 })
    .lean();

  const structuredFiles = files.filter((f) => isStructuredFile(f.mimeType));

  if (structuredFiles.length === 0) return [];

  // Get column schemas and row counts from DataRecord collection
  const schemas = await Promise.all(
    structuredFiles.map(async (f) => {
      const records = await DataRecord.find({ file: f._id })
        .select("columns rowNumber")
        .lean();

      // Collect unique column names across all rows
      const columnSet = new Set<string>();
      for (const r of records) {
        const cols = r.columns as unknown as Map<string, string>;
        if (cols && typeof cols.forEach === "function") {
          cols.forEach((_v, k) => columnSet.add(k));
        } else if (cols && typeof cols === "object") {
          Object.keys(cols).forEach((k) => columnSet.add(k));
        }
      }

      return {
        fileId: f._id.toString(),
        fileName: f.originalName,
        fileType: f.fileType,
        year: f.year,
        columns: Array.from(columnSet),
        rowCount: records.length,
      };
    })
  );

  return schemas;
}

export interface QueryDataRecordsParams {
  fileType?: string;
  year?: string;
  columnFilters?: Array<{
    column: string;
    value: string;
    match?: "exact" | "contains";
  }>;
  columns?: string[];
  limit?: number;
}

export interface QueryDataRecordsResult {
  rows: Record<string, string>[];
  totalMatched: number;
  truncated: boolean;
}

/**
 * Queries structured data records with optional filters.
 * Used by the queryDataRecords tool.
 */
export async function queryDataRecords(
  projectId: string,
  params: QueryDataRecordsParams
): Promise<QueryDataRecordsResult> {
  const limit = Math.min(params.limit ?? 50, 200);

  const filter: Record<string, unknown> = { project: projectId };
  if (params.fileType) filter.fileType = params.fileType;
  if (params.year) filter.year = params.year;

  // Apply column filters
  if (params.columnFilters && params.columnFilters.length > 0) {
    for (const cf of params.columnFilters) {
      const m = cf.match ?? "exact";
      const key = `columns.${cf.column}`;
      if (m === "contains") {
        filter[key] = { $regex: cf.value, $options: "i" };
      } else {
        filter[key] = cf.value;
      }
    }
  }

  // Get total count first
  const totalMatched = await DataRecord.countDocuments(filter);

  // Fetch limited results
  const records = await DataRecord.find(filter)
    .select("columns rowNumber sheetName fileType year")
    .limit(limit)
    .lean();

  // Convert to plain objects, optionally filtering columns
  const rows: Record<string, string>[] = records.map((r) => {
    const cols = r.columns as unknown as Map<string, string>;
    const rowObj: Record<string, string> = {};

    if (cols && typeof cols.forEach === "function") {
      cols.forEach((v, k) => {
        if (!params.columns || params.columns.includes(k)) {
          rowObj[k] = v;
        }
      });
    } else if (cols && typeof cols === "object") {
      for (const [k, v] of Object.entries(cols)) {
        if (!params.columns || params.columns.includes(k)) {
          rowObj[k] = String(v);
        }
      }
    }

    // Always include row number for reference
    if (!params.columns) {
      rowObj["_rowNumber"] = String(r.rowNumber);
    }
    return rowObj;
  });

  return {
    rows,
    totalMatched,
    truncated: totalMatched > limit,
  };
}
