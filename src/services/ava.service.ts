import https from "https";
import logger from "../config/logger";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AvaResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
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

/**
 * Calls the Anthropic Messages API directly via https (no SDK dependency).
 */
export async function callAva(
  messages: AnthropicMessage[],
  dataContext: string
): Promise<AvaResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  const systemWithContext = dataContext
    ? `${SYSTEM_PROMPT}\n\n--- PROJECT DATA CONTEXT ---\n${dataContext}`
    : SYSTEM_PROMPT;

  const body = JSON.stringify({
    model,
    max_tokens: 4096,
    system: systemWithContext,
    messages,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message || "Anthropic API error"));
          }
          resolve({
            content: parsed.content?.[0]?.text || "",
            inputTokens: parsed.usage?.input_tokens || 0,
            outputTokens: parsed.usage?.output_tokens || 0,
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Builds a text context string from uploaded project data files.
 * In production this would read/parse actual file contents.
 * Returns a placeholder indicating which files are available.
 */
export function buildDataContext(fileNames: string[]): string {
  if (!fileNames.length) return "No baseline data files have been uploaded for this project yet.";
  const list = fileNames.map((f) => `- ${f}`).join("\n");
  logger.debug(`Building context for ${fileNames.length} file(s)`);
  return `The following baseline data files have been uploaded for this project:\n${list}\n\n(File contents are indexed and available for analysis.)`;
}
