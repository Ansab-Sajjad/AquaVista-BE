import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { User } from "../models/User.model";
import { AppError } from "./errorHandler";
import { denylist } from "../services/token-denylist.service";
import { getAccessTokenFromCookie } from "../services/cookie.service";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  // Read token from httpOnly cookie first, fall back to Bearer header for backward compat
  const header = req.headers.authorization;
  let token: string | null = null;

  if (header?.startsWith("Bearer ")) {
    token = header.split(" ")[1];
  } else {
    token = getAccessTokenFromCookie(req);
  }

  if (!token) {
    throw new AppError("No token provided", 401);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");

  // Check denylist before verifying — revoked tokens are rejected immediately
  if (await denylist.has(token)) {
    throw new AppError("Token has been revoked", 401);
  }

  try {
    const payload = jwt.verify(token, secret) as { id: string; role: string };
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    throw new AppError("Admin access required", 403);
  }
  next();
}

/**
 * Verifies the requesting user has access to the project.
 * Admins have access to all projects. Project users must be members.
 */
export async function requireProjectAccess(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const { Project } = await import("../models/Project.model");
  const projectId = req.params.projectId || req.params.id;

  if (!projectId) {
    throw new AppError("Project ID is required", 400);
  }

  if (req.user?.role === "admin") return next();

  const project = await Project.findById(projectId);
  if (!project) throw new AppError("Project not found", 404);

  const isMember = project.members.some(
    (m) => m.user.toString() === req.user!.id
  );
  if (!isMember) throw new AppError("Access denied", 403);

  next();
}

/**
 * Refreshes lastActive timestamp — non-blocking.
 */
export function trackActivity(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.user?.id) {
    User.findByIdAndUpdate(req.user.id, { lastActive: new Date() }).catch(() => {
      /* ignore */
    });
  }
  next();
}
