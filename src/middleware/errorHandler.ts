import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).name === "MongoServerError") {
    const mongoErr = err as { code?: number; keyValue?: Record<string, unknown> };
    if (mongoErr.code === 11000) {
      const field = Object.keys(mongoErr.keyValue || {})[0];
      return res.status(409).json({ message: `${field} already exists` });
    }
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(422).json({ message: err.message });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID format" });
  }

  logger.error(err);
  return res.status(500).json({ message: "Internal server error" });
}
