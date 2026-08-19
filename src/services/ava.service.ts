import { GoogleGenAI, createPartFromFunctionResponse, type Content, type Part } from "@google/genai";
import logger from "../config/logger";
import { GEMINI_TOOLS, OPENAI_TOOLS, executeAvaTool } from "./ava-tools.service";

export type AiProvider = "gemini" | "groq" | "ollama";

interface AvaMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AvaTableData {
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface AvaChartData {
  chartType: "bar" | "line" | "pie";
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
}

interface AvaResponse {
  content: string;
  type: "narrative" | "table" | "chart";
  tableData?: AvaTableData;
  chartData?: AvaChartData;
  inputTokens: number;
  outputTokens: number;
  provider: AiProvider;
}

/**
 * Parses an AVA raw text response, extracting any structured
 * "ava-table" or "ava-chart" fenced blocks. Returns the cleaned
 * narrative content, the detected response type, and any structured data.
 */
export function parseAvaResponse(raw: string): {
  content: string;
  type: "narrative" | "table" | "chart";
  tableData?: AvaTableData;
  chartData?: AvaChartData;
} {
  let content = raw;
  let tableData: AvaTableData | undefined;
  let chartData: AvaChartData | undefined;

  // Extract ava-table block(s) — use the first valid one
  const tableMatch = content.match(/```ava-table\s*([\s\S]*?)```/i);
  if (tableMatch) {
    try {
      const parsed = JSON.parse(tableMatch[1].trim());
      if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        tableData = {
          title: typeof parsed.title === "string" ? parsed.title : undefined,
          columns: parsed.columns.map((c: unknown) => String(c)),
          rows: parsed.rows.map((row: unknown) =>
            Array.isArray(row) ? row.map((cell: unknown) => String(cell)) : [String(row)]
          ),
        };
      }
    } catch (err) {
      logger.warn("Failed to parse ava-table block", { error: err instanceof Error ? err.message : err });
    }
    content = content.replace(tableMatch[0], "").trim();
  }

  // Extract ava-chart block(s) — use the first valid one
  const chartMatch = content.match(/```ava-chart\s*([\s\S]*?)```/i);
  if (chartMatch) {
    try {
      const parsed = JSON.parse(chartMatch[1].trim());
      if (
        parsed &&
        ["bar", "line", "pie"].includes(parsed.chartType) &&
        Array.isArray(parsed.labels)
      ) {
        const series = Array.isArray(parsed.series)
          ? parsed.series.map((s: any) => ({
              name: String(s.name || "Series"),
              values: Array.isArray(s.values) ? s.values.map((v: unknown) => Number(v) || 0) : [],
            }))
          : [];
        chartData = {
          chartType: parsed.chartType,
          title: typeof parsed.title === "string" ? parsed.title : undefined,
          xAxisLabel: typeof parsed.xAxisLabel === "string" ? parsed.xAxisLabel : undefined,
          yAxisLabel: typeof parsed.yAxisLabel === "string" ? parsed.yAxisLabel : undefined,
          labels: parsed.labels.map((l: unknown) => String(l)),
          series,
        };
      }
    } catch (err) {
      logger.warn("Failed to parse ava-chart block", { error: err instanceof Error ? err.message : err });
    }
    content = content.replace(chartMatch[0], "").trim();
  }

  // Determine primary type: prefer table > chart > narrative when both exist
  let type: "narrative" | "table" | "chart" = "narrative";
  if (tableData) type = "table";
  else if (chartData) type = "chart";

  return { content, type, tableData, chartData };
}

const SYSTEM_PROMPT = `You are AVA (AquaVista Assistant), a financial modelling and rate study analyst for municipal water, wastewater, sewer, stormwater, and related utility enterprises.

You assist consultants and municipal stakeholders by analyzing uploaded project data and answering questions about:
- Revenue, expenses, and net position
- Debt service coverage and reserve adequacy
- Customer class allocation and consumption
- Capital improvement planning (CIP)
- Rate adequacy and sufficiency
- Budget projections and year-over-year trends

RESPONSE STYLE:
- Be direct, professional, data-driven, and proper.
- Provide specific numbers and data points from the files
- Use bold formatting for key figures and important data points
- Structure information clearly with bullet points or tables when helpful
- Never explain what a field "means" - just provide the actual data
- Provide 1-2 lines for simple questions, more detail for complex queries


GOVERNMENTAL TERMINOLOGY (STRICT):
- NEVER use the terms: "Profit", "Loss", "P&L", or "Profit and Loss" in any response, table, or chart label.
- ALWAYS use these governmental/municipal terms instead where applicable:
  Revenue, Operating Revenue, Total Revenue, Expenses, Operating Expenses, Total Expenses,
  Net Position, Change in Net Position, Beginning Net Position, Ending Net Position,
  Cash Flows, Fund Balance.

STRICT RULES:
- Only answer questions grounded in the project's uploaded baseline data provided in the context.
- If data is missing or incomplete: clearly explain what information is unavailable, do NOT generate misleading values, do NOT treat missing values as confirmed zero values, and state any limitation affecting the answer.
- Never fabricate numbers.
- Ensure responses are at least 50 characters long.
- Include document references and years only when specifically asked or when necessary for clarity

BUDGET PROJECTION QUESTIONS:
You must support questions such as "Create a budget projection for next year", "Project operating expenses for next year", "Create a projected financial snapshot for the next budget year", or "Use the current financial snapshot format and add a projected year".
When returning a projection, you MUST state all relevant assumptions, including:
- Historical trend period used
- Average or median basis
- Growth rate applied
- Inflation assumption, if used
- Missing-data limitations
A projection may be narrative, a table, or a basic chart if helpful. Projection results must NOT be downloadable.

RESPONSE FORMATS — STRUCTURED TABLES AND CHARTS:
When a table is the clearest response format (e.g. financial line items, customer class summaries, year-over-year values, budget projection outputs), append a fenced code block tagged "ava-table" AFTER your narrative explanation. Format:
\`\`\`ava-table
{"title": "Optional table title", "columns": ["Column 1", "Column 2", "Column 3"], "rows": [["v1","v2","v3"], ["v1","v2","v3"]]}
\`\`\`
Use string values for every cell. Apply currency formatting (e.g. "$1,234,567"), percentage formatting (e.g. "12.5%"), and year labels as needed. Do NOT include download instructions.

When a basic chart (bar, line, or pie) helps answer the question, append a fenced code block tagged "ava-chart" AFTER your narrative. Format:
\`\`\`ava-chart
{"chartType": "bar", "title": "Optional chart title", "xAxisLabel": "X label", "yAxisLabel": "Y label", "labels": ["A","B","C"], "series": [{"name": "Series 1", "values": [10,20,30]}]}
\`\`\`
For pie charts, use a single series with "labels" as the slice labels and "values" as the slice values. Only use bar, line, or pie charts. Do NOT include filters, drilldowns, or interactive controls.

If neither a table nor a chart is appropriate, return a plain narrative answer with no fenced block. You may include both an ava-table and an ava-chart block in the same response when both help.

TOOL USE — DATA QUERYING:
You have access to tools that let you query the project's data on demand instead of receiving all data in the context window.
- Call listDataFiles to see what structured data files (Excel/CSV) are available, including their file types, years, column names, and row counts.
- Call queryDataRecords to retrieve specific rows from structured data files. You can filter by fileType, year, and column values.
- Call searchDocuments to semantically search PDF documents (rate resolutions, audit narratives, and other unstructured documents). This returns the most relevant text passages matching your query.
- ALWAYS call listDataFiles first if you need to understand the schema before querying structured data.
- For questions about specific financial figures, customer data, rate tables, CIP projects, or demographics, use the structured data tools to get precise values.
- For questions about document content, policy details, resolution text, or narrative information in PDFs, use searchDocuments.
- The data context provided below includes summaries of available files (both structured and PDF). Use the tools to retrieve actual content.
- Do NOT guess or fabricate data — always use the tools to retrieve actual values.
- You may make multiple tool calls in sequence to gather all the data needed to answer a question.`;

async function callGeminiProvider(
  messages: AvaMessage[],
  systemPrompt: string,
  projectId?: string
): Promise<AvaResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const ai = new GoogleGenAI({ apiKey });

  // Build contents as structured Content objects (required for tool calling)
  const contents = messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const config: Record<string, unknown> = {
    systemInstruction: systemPrompt,
    temperature: 0.0,
    maxOutputTokens: 4096,
  };
  if (projectId) {
    config.tools = GEMINI_TOOLS;
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_TOOL_ROUNDS = 5;
  let currentContents: Content[] = [...contents];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.models.generateContent({
      model,
      contents: currentContents,
      config,
    });

    totalInputTokens += response.usageMetadata?.promptTokenCount || 0;
    totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0;

    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0 || !projectId) {
      // No function calls — return the text response
      const rawContent = response.text?.trim() || "";
      const parsed = parseAvaResponse(rawContent);
      return {
        content: parsed.content,
        type: parsed.type,
        tableData: parsed.tableData,
        chartData: parsed.chartData,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        provider: "gemini",
      };
    }

    // Execute function calls and build response parts
    const functionResponseParts: Part[] = [];
    for (const fc of functionCalls) {
      const result = await executeAvaTool(fc.name!, fc.args || {}, projectId);
      functionResponseParts.push(
        createPartFromFunctionResponse(fc.id || "", fc.name!, result)
      );
    }

    // Append model's response and function responses to conversation
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      currentContents = [...currentContents, modelContent];
    }
    currentContents = [
      ...currentContents,
      { role: "user", parts: functionResponseParts },
    ];
  }

  // Max tool rounds reached — final call without tools
  logger.warn(`Gemini: max tool rounds (${MAX_TOOL_ROUNDS}) reached, making final call without tools`);
  const finalConfig = { ...config };
  delete (finalConfig as Record<string, unknown>).tools;
  const finalResponse = await ai.models.generateContent({
    model,
    contents: currentContents,
    config: finalConfig,
  });

  totalInputTokens += finalResponse.usageMetadata?.promptTokenCount || 0;
  totalOutputTokens += finalResponse.usageMetadata?.candidatesTokenCount || 0;

  const rawContent = finalResponse.text?.trim() || "";
  const parsed = parseAvaResponse(rawContent);
  return {
    content: parsed.content,
    type: parsed.type,
    tableData: parsed.tableData,
    chartData: parsed.chartData,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    provider: "gemini",
  };
}

async function callGroqProvider(
  messages: AvaMessage[],
  systemPrompt: string,
  projectId?: string
): Promise<AvaResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const chatMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const body: any = {
    model,
    messages: chatMessages,
    temperature: 0.0,
    max_tokens: 4096,
  };
  if (projectId) {
    body.tools = OPENAI_TOOLS;
    body.tool_choice = "auto";
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const error = new Error(`Groq API error (${res.status}): ${errText}`);
      (error as any).statusCode = res.status;
      throw error;
    }

    const data = (await res.json()) as any;
    totalInputTokens += data.usage?.prompt_tokens || 0;
    totalOutputTokens += data.usage?.completion_tokens || 0;

    const message = data.choices?.[0]?.message;

    if (message?.tool_calls && message.tool_calls.length > 0 && projectId) {
      // Add assistant message with tool calls to conversation
      chatMessages.push(message);

      // Execute each tool call
      for (const tc of message.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeAvaTool(tc.function.name, args, projectId);
        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      body.messages = chatMessages;
      continue;
    }

    // No tool calls — return text response
    const rawContent = (message?.content || "").trim();
    const parsed = parseAvaResponse(rawContent);
    return {
      content: parsed.content,
      type: parsed.type,
      tableData: parsed.tableData,
      chartData: parsed.chartData,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      provider: "groq",
    };
  }

  // Max tool rounds — final call without tools
  logger.warn(`Groq: max tool rounds (${MAX_TOOL_ROUNDS}) reached, making final call without tools`);
  delete body.tools;
  delete body.tool_choice;
  body.messages = chatMessages;

  const finalRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!finalRes.ok) {
    const errText = await finalRes.text().catch(() => "");
    const error = new Error(`Groq API error (${finalRes.status}): ${errText}`);
    (error as any).statusCode = finalRes.status;
    throw error;
  }

  const finalData = (await finalRes.json()) as any;
  totalInputTokens += finalData.usage?.prompt_tokens || 0;
  totalOutputTokens += finalData.usage?.completion_tokens || 0;

  const rawContent = (finalData.choices?.[0]?.message?.content || "").trim();
  const parsed = parseAvaResponse(rawContent);
  return {
    content: parsed.content,
    type: parsed.type,
    tableData: parsed.tableData,
    chartData: parsed.chartData,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    provider: "groq",
  };
}

async function callOllamaProvider(
  messages: AvaMessage[],
  systemPrompt: string,
  projectId?: string
): Promise<AvaResponse> {
  const apiKey = process.env.OLLAMA_API_KEY;
  const baseUrl = process.env.OLLAMA_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.OLLAMA_MODEL || "deepseek/deepseek-r1:free";

  const chatMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const body: any = {
    model,
    messages: chatMessages,
    temperature: 0.0,
    max_tokens: 4096,
  };
  if (projectId) {
    body.tools = OPENAI_TOOLS;
    body.tool_choice = "auto";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const error = new Error(`Ollama/OpenRouter API error (${res.status}): ${errText}`);
      (error as any).statusCode = res.status;
      throw error;
    }

    const data = (await res.json()) as any;
    totalInputTokens += data.usage?.prompt_tokens || 0;
    totalOutputTokens += data.usage?.completion_tokens || 0;

    const message = data.choices?.[0]?.message;

    if (message?.tool_calls && message.tool_calls.length > 0 && projectId) {
      // Add assistant message with tool calls to conversation
      chatMessages.push(message);

      // Execute each tool call
      for (const tc of message.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeAvaTool(tc.function.name, args, projectId);
        chatMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      body.messages = chatMessages;
      continue;
    }

    // No tool calls — return text response
    const rawContent = (message?.content || "").trim();
    const parsed = parseAvaResponse(rawContent);
    return {
      content: parsed.content,
      type: parsed.type,
      tableData: parsed.tableData,
      chartData: parsed.chartData,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      provider: "ollama",
    };
  }

  // Max tool rounds — final call without tools
  logger.warn(`Ollama: max tool rounds (${MAX_TOOL_ROUNDS}) reached, making final call without tools`);
  delete body.tools;
  delete body.tool_choice;
  body.messages = chatMessages;

  const finalRes = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!finalRes.ok) {
    const errText = await finalRes.text().catch(() => "");
    const error = new Error(`Ollama/OpenRouter API error (${finalRes.status}): ${errText}`);
    (error as any).statusCode = finalRes.status;
    throw error;
  }

  const finalData = (await finalRes.json()) as any;
  totalInputTokens += finalData.usage?.prompt_tokens || 0;
  totalOutputTokens += finalData.usage?.completion_tokens || 0;

  const rawContent = (finalData.choices?.[0]?.message?.content || "").trim();
  const parsed = parseAvaResponse(rawContent);
  return {
    content: parsed.content,
    type: parsed.type,
    tableData: parsed.tableData,
    chartData: parsed.chartData,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    provider: "ollama",
  };
}

/**
 * Calls the requested AI provider with automatic fallback if quota/rate limit is hit.
 * When projectId is provided, tool calling is enabled — the AI can query structured
 * data files on demand instead of receiving all data in the context window.
 */
export async function callAva(
  messages: AvaMessage[],
  dataContext: string,
  preferredProvider: AiProvider = "gemini",
  projectId?: string
): Promise<AvaResponse> {
  const promptSystem = dataContext
    ? `${SYSTEM_PROMPT}\n\n--- PROJECT DATA CONTEXT ---\n${dataContext}`
    : SYSTEM_PROMPT;

  const allProviders: AiProvider[] = ["gemini", "groq", "ollama"];
  const providerOrder = [
    preferredProvider,
    ...allProviders.filter((p) => p !== preferredProvider),
  ];

  let lastError: Error | null = null;

  for (const provider of providerOrder) {
    try {
      logger.info(`Attempting AVA call with AI provider: ${provider}${projectId ? " (tool-calling enabled)" : ""}`);
      let result: AvaResponse;

      if (provider === "groq") {
        result = await callGroqProvider(messages, promptSystem, projectId);
      } else if (provider === "ollama") {
        result = await callOllamaProvider(messages, promptSystem, projectId);
      } else {
        result = await callGeminiProvider(messages, promptSystem, projectId);
      }

      logger.info(`AVA call succeeded using provider: ${provider}`);
      return result;
    } catch (err: any) {
      lastError = err;
      const isQuotaError = err.statusCode === 429 || err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("rate limit");

      if (isQuotaError) {
        logger.warn(`AI Provider '${provider}' hit quota/rate limit: ${err.message}. Trying fallback...`);
      } else {
        logger.warn(`AI Provider '${provider}' failed: ${err.message}. Trying fallback if available...`);
      }
    }
  }

  throw lastError || new Error("All AI providers failed to process the request.");
}

/**
 * Builds a text context string from uploaded project data files,
 * including the actual extracted content from each file.
 */
export function buildDataContext(
  files: Array<{ name: string; fileType: string; year?: string; extractedText: string }>
): string {
  if (!files.length)
    return "No baseline data files have been uploaded for this project yet.";

  const MAX_CONTEXT_CHARS = 90000; // ~30k tokens
  let totalChars = 0;
  const sections: string[] = [];

  for (const file of files) {
    if (!file.extractedText) continue;

    const header = `### ${file.fileType}${file.year ? ` (${file.year})` : ""}: ${file.name}`;
    const content = file.extractedText;
    const section = `${header}\n${content}`;

    if (totalChars + section.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining > 500) {
        sections.push(
          `${header}\n${content.slice(0, remaining)}...\n[TRUNCATED - file too large for context window]`
        );
      }
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  if (sections.length === 0) {
    return "Baseline data files have been uploaded but no text content could be extracted from them.";
  }

  logger.debug(`Building context for ${files.length} file(s), ${totalChars} chars`);
  return `## PROJECT BASELINE DATA\n\nThe following data has been extracted from the project's uploaded files. Use this data to answer questions accurately.\n\n${sections.join("\n\n---\n\n")}`;
}
