import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { DocumentTemplate } from "../models/DocumentTemplate.model";

const TEMPLATE_CONFIGS = [
  {
    fileName: "Budget _ Audit Data.xlsx",
    name: "Budget / Audit Data Template",
    description: "Standard budget and audit data layout.",
    fileType: "Budget / Audit Data",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    fileName: "CIP Register.xlsx",
    name: "CIP Register Template",
    description: "Capital improvement plan register template.",
    fileType: "CIP Register",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    fileName: "Customer Allocation _ Billing Data.xlsx",
    name: "Customer Allocation / Billing Data Template",
    description: "Revenue and consumption by customer class template.",
    fileType: "Customer Allocation / Billing Data",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    fileName: "Demographics.xlsx",
    name: "Demographics Template",
    description: "Population and household demographic data template.",
    fileType: "Demographics",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    fileName: "Rate Resolution.pdf",
    name: "Rate Resolution Template",
    description: "Official rate resolution documentation template.",
    fileType: "Rate Resolution",
    mimeType: "application/pdf",
  },
  {
    fileName: "Rate Table.xlsx",
    name: "Rate Table Template",
    description: "Existing rate structure and tier layout template.",
    fileType: "Rate Table",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
];

export async function seedTemplates() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB for template seeding");
  }

  const templatesDir = path.join(__dirname, "../../Docment templates");
  if (!fs.existsSync(templatesDir)) {
    console.log("Docment templates folder does not exist or was already processed.");
    return;
  }

  for (const config of TEMPLATE_CONFIGS) {
    const filePath = path.join(templatesDir, config.fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`Template file missing on disk: ${config.fileName}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const sizeBytes = fileBuffer.length;

    await DocumentTemplate.findOneAndUpdate(
      { fileType: config.fileType },
      {
        name: config.name,
        description: config.description,
        fileType: config.fileType,
        originalName: config.fileName,
        mimeType: config.mimeType,
        sizeBytes,
        fileData: fileBuffer,
      },
      { upsert: true, new: true }
    );

    console.log(`Seeded template: ${config.name} (${sizeBytes} bytes)`);
  }

  console.log("Templates seeding complete.");
}

if (require.main === module) {
  seedTemplates()
    .then(async () => {
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Template seeding failed:", err);
      process.exit(1);
    });
}
