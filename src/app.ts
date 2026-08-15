import cors from "cors";
import cookieParser from "cookie-parser";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import { errorHandler } from "./middleware/errorHandler";
import { generalRateLimiter } from "./middleware/rateLimiter";
import { swaggerSpec } from "./config/swagger";
import authRoutes from "./routes/auth.routes";
import dataRoutes from "./routes/data.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import avaRoutes from "./routes/ava.routes";
import notificationRoutes from "./routes/notification.routes";
import projectRoutes from "./routes/project.routes";
import statsRoutes from "./routes/stats.routes";
import userRoutes from "./routes/user.routes";

const app = express();

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS — allow the Next.js frontend (configurable via CORS_ORIGIN env var)
const defaultOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://aqua-vista-fe.vercel.app"]
    : ["http://localhost:3000"];

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : defaultOrigins;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Cookies
app.use(cookieParser());

// Rate limiting
app.use("/api", generalRateLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/projects", userRoutes);
app.use("/api/projects", dataRoutes);
app.use("/api/projects", avaRoutes);
app.use("/api/projects", dashboardRoutes);

// API docs
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 fallback
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use(errorHandler as (err: Error, req: Request, res: Response, next: NextFunction) => void);

export default app;
