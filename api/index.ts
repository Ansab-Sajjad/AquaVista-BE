import "express-async-errors";
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../src/config/database";
import { validateEnv } from "../src/config/env.validation";
import app from "../src/app";

validateEnv();

// Cache the connection promise so warm invocations skip reconnecting
let dbConnected = false;

export default async function handler(req: any, res: any) {
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
  // Delegate to the Express app
  return app(req, res);
}
