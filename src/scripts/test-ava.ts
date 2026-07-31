import dotenv from "dotenv";
dotenv.config();

import { callAva, buildDataContext } from "../services/ava.service";

async function main() {
  console.log("Testing multi-turn chat with Ask AVA...");
  const dataContext = buildDataContext(["Water_Rates_2025.xlsx", "CIP_Plan.pdf"]);

  const messages = [
    { role: "user" as const, content: "What baseline files do we have uploaded?" },
    { role: "assistant" as const, content: "The baseline files uploaded are Water_Rates_2025.xlsx and CIP_Plan.pdf." },
    { role: "user" as const, content: "Summarize how you can help me analyze these files." },
  ];

  try {
    const response = await callAva(messages, dataContext);
    console.log("\n--- AVA Response ---");
    console.log(response.content);
    console.log("--------------------");
    console.log(`Tokens: input=${response.inputTokens}, output=${response.outputTokens}\n`);
    console.log("ALL TESTS PASSED SUCCESSFULLY!");
  } catch (err: any) {
    console.error("Multi-turn test failed:", err);
    process.exit(1);
  }
}

main();
