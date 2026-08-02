/**
 * One-time migration script to extract text content from existing uploaded files.
 * Run with: npx ts-node src/scripts/extract-existing-files.ts
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { DataFile } from "../models/DataFile.model";
import { extractTextFromFile } from "../services/document-extractor.service";

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Find all files that haven't been extracted yet
  const files = await DataFile.find({
    $or: [
      { extractedText: { $exists: false } },
      { extractedText: "" },
      { extractedText: null },
    ],
  });

  console.log(`Found ${files.length} file(s) to process`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    console.log(`\nProcessing: ${file.originalName} (${file.mimeType})`);
    console.log(`  Storage path: ${file.storagePath}`);

    try {
      const extractedText = await extractTextFromFile(
        file.storagePath,
        file.mimeType
      );

      if (extractedText) {
        await DataFile.findByIdAndUpdate(file._id, {
          extractedText,
          extractedAt: new Date(),
          status: "Completed",
        });
        console.log(
          `  ✓ Extracted ${extractedText.length} chars`
        );
        success++;
      } else {
        console.log(`  ⚠ No text could be extracted`);
        await DataFile.findByIdAndUpdate(file._id, {
          status: "Completed",
          extractedText: "",
        });
        success++;
      }
    } catch (err) {
      console.error(
        `  ✗ Failed:`,
        err instanceof Error ? err.message : err
      );
      await DataFile.findByIdAndUpdate(file._id, { status: "Failed" });
      failed++;
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`Success: ${success}, Failed: ${failed}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
