import { getDataFileSchemas, queryDataRecords } from "./structured-parser.service";
import { searchDocuments } from "./embedding.service";
import logger from "../config/logger";

/**
 * AVA Tool Definitions
 *
 * These tools allow the AI to query project data on demand
 * instead of receiving all data in the context window.
 *
 * Three tools are provided:
 * 1. listDataFiles — returns schema info (file types, years, columns, row counts)
 * 2. queryDataRecords — queries actual row data with optional filters
 * 3. searchDocuments — semantic search over PDF document chunks (rate resolutions, audit narratives)
 */

// ---------------------------------------------------------------------------
// Gemini (Google GenAI) function declarations
// ---------------------------------------------------------------------------

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "listDataFiles",
        description:
          "List all structured data files (Excel/CSV) available in the project with their file types, years, column names, and row counts. Call this first to understand what data is available before querying specific records.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "queryDataRecords",
        description:
          "Query structured data records (rows from Excel/CSV files) with optional filters. Returns matching rows as objects with column names as keys. Use listDataFiles first to see available columns. Limit defaults to 50 rows (max 200).",
        parameters: {
          type: "object",
          properties: {
            fileType: {
              type: "string",
              description:
                "Filter by file type (e.g. 'Financial Snapshot', 'Customer Allocation / Billing Data', 'CIP Register', 'Rate Table', 'Demographics', 'Budget / Audit Data', 'Rate Resolution')",
            },
            year: {
              type: "string",
              description: "Filter by year (e.g. '2024', '2023')",
            },
            columnFilters: {
              type: "array",
              description: "Filter rows by column values",
              items: {
                type: "object",
                properties: {
                  column: { type: "string", description: "Column name to filter on" },
                  value: { type: "string", description: "Value to match" },
                  match: {
                    type: "string",
                    enum: ["exact", "contains"],
                    description: "Match type: 'exact' for exact match, 'contains' for substring match (case-insensitive). Defaults to 'exact'.",
                  },
                },
                required: ["column", "value"],
              },
            },
            columns: {
              type: "array",
              items: { type: "string" },
              description: "Specific columns to return. If omitted, all columns are returned.",
            },
            limit: {
              type: "number",
              description: "Maximum number of rows to return (default 50, max 200)",
            },
          },
        },
      },
      {
        name: "searchDocuments",
        description:
          "Search PDF documents (rate resolutions, audit narratives, and other unstructured documents) semantically. Returns the most relevant text passages matching the query. Use this for questions about document content, policy details, resolution text, or narrative information in PDFs.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query — describe what information you're looking for in the documents.",
            },
            topK: {
              type: "number",
              description: "Number of results to return (default 5, max 20). Each result is a text passage from a document.",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// OpenAI-compatible (Groq, Ollama/OpenRouter) tool definitions
// ---------------------------------------------------------------------------

export const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "listDataFiles",
      description:
        "List all structured data files (Excel/CSV) available in the project with their file types, years, column names, and row counts. Call this first to understand what data is available before querying specific records.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "queryDataRecords",
      description:
        "Query structured data records (rows from Excel/CSV files) with optional filters. Returns matching rows as objects with column names as keys. Use listDataFiles first to see available columns. Limit defaults to 50 rows (max 200).",
      parameters: {
        type: "object",
        properties: {
          fileType: {
            type: "string",
            description:
              "Filter by file type (e.g. 'Financial Snapshot', 'Customer Allocation / Billing Data', 'CIP Register', 'Rate Table', 'Demographics', 'Budget / Audit Data', 'Rate Resolution')",
          },
          year: {
            type: "string",
            description: "Filter by year (e.g. '2024', '2023')",
          },
          columnFilters: {
            type: "array",
            description: "Filter rows by column values",
            items: {
              type: "object",
              properties: {
                column: { type: "string", description: "Column name to filter on" },
                value: { type: "string", description: "Value to match" },
                match: {
                  type: "string",
                  enum: ["exact", "contains"],
                  description: "Match type: 'exact' for exact match, 'contains' for substring match (case-insensitive). Defaults to 'exact'.",
                },
              },
              required: ["column", "value"],
            },
          },
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Specific columns to return. If omitted, all columns are returned.",
          },
          limit: {
            type: "number",
            description: "Maximum number of rows to return (default 50, max 200)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchDocuments",
      description:
        "Search PDF documents (rate resolutions, audit narratives, and other unstructured documents) semantically. Returns the most relevant text passages matching the query. Use this for questions about document content, policy details, resolution text, or narrative information in PDFs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query — describe what information you're looking for in the documents.",
          },
          topK: {
            type: "number",
            description: "Number of results to return (default 5, max 20). Each result is a text passage from a document.",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Executes a tool call by name with the given arguments.
 * Returns the result as a plain object suitable for JSON serialization.
 */
export async function executeAvaTool(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string
): Promise<Record<string, unknown>> {
  logger.debug(`Executing AVA tool: ${toolName}`, { projectId, args });

  try {
    switch (toolName) {
      case "listDataFiles": {
        const schemas = await getDataFileSchemas(projectId);
        return { files: schemas };
      }

      case "queryDataRecords": {
        const result = await queryDataRecords(projectId, {
          fileType: args.fileType as string | undefined,
          year: args.year as string | undefined,
          columnFilters: args.columnFilters as
            | Array<{ column: string; value: string; match?: "exact" | "contains" }>
            | undefined,
          columns: args.columns as string[] | undefined,
          limit: args.limit as number | undefined,
        });
        return {
          rows: result.rows,
          totalMatched: result.totalMatched,
          truncated: result.truncated,
        };
      }

      case "searchDocuments": {
        const query = args.query as string;
        if (!query) return { error: "query is required" };
        const topK = Math.min((args.topK as number) || 5, 20);
        const results = await searchDocuments(projectId, query, topK);
        return { results, totalResults: results.length };
      }

      default:
        logger.warn(`Unknown AVA tool called: ${toolName}`);
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    logger.error(`AVA tool execution failed: ${toolName}`, {
      error: err instanceof Error ? err.message : err,
      projectId,
    });
    return {
      error: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}
