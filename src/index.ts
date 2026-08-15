import "express-async-errors";
import dotenv from "dotenv";

dotenv.config();

import app from "./app";
import { connectDB } from "./config/database";
import logger from "./config/logger";
import { validateEnv } from "./config/env.validation";

validateEnv();

const PORT = parseInt(process.env.PORT || "5000", 10);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`AquaVista API running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
