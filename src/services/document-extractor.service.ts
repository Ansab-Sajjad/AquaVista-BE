import fs from "fs";
import path from "path";
import logger from "../config/logger";

/**
 * Extracts text content from an uploaded file based on its MIME type.
 * Supports .xlsx, .csv, and .pdf files.
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string
): Promise<string> {
  if (!fs.existsSync(filePath)) {
    logger.warn(`File not found for extraction: ${filePath}`);
    return "";
  }

  try {
    switch (mimeType) {
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return await extractFromExcel(filePath);
      case "text/csv":
      case "application/csv":
        return await extractFromCsv(filePath);
      case "application/pdf":
        return await extractFromPdf(filePath);
      default:
        logger.warn(`Unsupported MIME type for extraction: ${mimeType}`);
        return "";
    }
  } catch (err) {
    logger.error("Text extraction failed", {
      filePath,
      mimeType,
      error: err instanceof Error ? err.message : err,
    });
    return "";
  }
}

/**
 * Extracts text from an Excel (.xlsx) file.
 * Converts each sheet into a markdown table.
 */
async function extractFromExcel(filePath: string): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.readFile(filePath, { type: "file" });

  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Convert sheet to array of arrays (rows)
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });

    if (rows.length === 0) continue;

    // Build a markdown table
    const headerRow = rows[0] as string[];
    const dataRows = rows.slice(1);

    if (headerRow.length === 0) continue;

    const header = `| ${headerRow.map((h) => String(h).trim() || "—").join(" | ")} |`;
    const separator = `| ${headerRow.map(() => "---").join(" | ")} |`;
    const body = dataRows
      .map((row) => {
        const cells = headerRow.map((_, i) => String(row[i] ?? "").trim());
        return `| ${cells.join(" | ")} |`;
      })
      .join("\n");

    sections.push(`#### Sheet: ${sheetName}\n${header}\n${separator}\n${body}`);
  }

  return sections.join("\n\n") || "No data found in spreadsheet.";
}

/**
 * Extracts text from a CSV file.
 * Uses the xlsx library to parse CSV consistently.
 */
async function extractFromCsv(filePath: string): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.readFile(filePath, { type: "file" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return "No data found in CSV.";

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return "No data found in CSV.";

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rows.length === 0) return "No data found in CSV.";

  const headerRow = rows[0] as string[];
  const dataRows = rows.slice(1);

  const header = `| ${headerRow.map((h) => String(h).trim() || "—").join(" | ")} |`;
  const separator = `| ${headerRow.map(() => "---").join(" | ")} |`;
  const body = dataRows
    .map((row) => {
      const cells = headerRow.map((_, i) => String(row[i] ?? "").trim());
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

/**
 * Extracts text from a PDF file.
 */
async function extractFromPdf(filePath: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text?.trim() || "No text content found in PDF.";
}
