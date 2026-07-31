import { GoogleGenAI } from "@google/genai";
import logger from "../config/logger";

export type AiProvider = "gemini" | "groq" | "ollama";

interface AvaMessage {
  role: "user" | "assistant";
  content: string;
}

interface AvaResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  provider: AiProvider;
}

const SYSTEM_PROMPT = `You are AVA (AquaVista Assistant), a financial modelling and rate study analyst for municipal water, wastewater, sewer, stormwater, and related utility enterprises.

You assist consultants and municipal stakeholders by analyzing uploaded project data and answering questions about:
- Revenue, expenses, and net position
- Debt service coverage and reserve adequacy
- Customer class allocation and consumption
- Capital improvement planning (CIP)
- Rate adequacy and sufficiency
- Budget projections and year-over-year trends

STRICT RULES:
- Only answer questions grounded in the project's uploaded baseline data provided in the context.
- Use governmental accounting terminology: Revenue, Expenses, Net Position, Change in Net Position — never "Profit", "Loss", or "P&L".
- If data is missing or incomplete, say so clearly. Never fabricate numbers.
- Cite source files and year when using specific data.
- For structured comparisons, return a markdown table.
- For visual requests, describe what a chart would show and provide the underlying data as a table.
- Budget projections should state assumptions clearly (growth rate, inflation, basis period).
- Keep responses concise and grounded in facts.`;

async function callGeminiProvider(messages: AvaMessage[], systemPrompt: string): Promise<AvaResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  const history = messages
    .map((message) =>
      message.role === "user"
        ? `User: ${message.content}`
        : `Assistant: ${message.content}`
    )
    .join("\n\n");

  const response = await ai.models.generateContent({
    model,
    contents: `${history}\n\nAssistant:`,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.0,
      maxOutputTokens: 1200,
    },
  });

  const usageMetadata = response.usageMetadata;
  return {
    content: response.text?.trim() || "",
    inputTokens: usageMetadata?.promptTokenCount || 0,
    outputTokens: usageMetadata?.candidatesTokenCount || 0,
    provider: "gemini",
  };
}

async function callGroqProvider(messages: AvaMessage[], systemPrompt: string): Promise<AvaResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: chatMessages,
      temperature: 0.0,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const error = new Error(`Groq API error (${res.status}): ${errText}`);
    (error as any).statusCode = res.status;
    throw error;
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content || "";
  const usage = data.usage;

  return {
    content: content.trim(),
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
    provider: "groq",
  };
}

async function callOllamaProvider(messages: AvaMessage[], systemPrompt: string): Promise<AvaResponse> {
  const apiKey = process.env.OLLAMA_API_KEY;
  const baseUrl = process.env.OLLAMA_BASE_URL || "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.OLLAMA_MODEL || "deepseek/deepseek-r1:free";

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: chatMessages,
      temperature: 0.0,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const error = new Error(`Ollama/OpenRouter API error (${res.status}): ${errText}`);
    (error as any).statusCode = res.status;
    throw error;
  }

  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content || "";
  const usage = data.usage;

  return {
    content: content.trim(),
    inputTokens: usage?.prompt_tokens || 0,
    outputTokens: usage?.completion_tokens || 0,
    provider: "ollama",
  };
}

/**
 * Calls the requested AI provider with automatic fallback if quota/rate limit is hit.
 */
export async function callAva(
  messages: AvaMessage[],
  dataContext: string,
  preferredProvider: AiProvider = "gemini"
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
      logger.info(`Attempting AVA call with AI provider: ${provider}`);
      let result: AvaResponse;

      if (provider === "groq") {
        result = await callGroqProvider(messages, promptSystem);
      } else if (provider === "ollama") {
        result = await callOllamaProvider(messages, promptSystem);
      } else {
        result = await callGeminiProvider(messages, promptSystem);
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
 * Builds a text context string from uploaded project data files.
 */
export function buildDataContext(fileNames: string[]): string {
  if (!fileNames.length) return "No baseline data files have been uploaded for this project yet.";
  const list = fileNames.map((f) => `- ${f}`).join("\n");
  logger.debug(`Building context for ${fileNames.length} file(s)`);
  return `The following baseline data files have been uploaded for this project:\n${list}\n\n(File contents are indexed and available for analysis.)`;
}
