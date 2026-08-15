import crypto from "crypto";
import jwt from "jsonwebtoken";
import { IUser } from "../models/User.model";

export function generateAccessToken(user: IUser): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

export function generateRefreshToken(user: IUser): string {
  const secret = process.env.JWT_REFRESH_SECRET!;
  return jwt.sign(
    { id: user._id.toString(), role: user.role, type: "refresh" },
    secret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
  );
}

export function verifyRefreshToken(token: string): { id: string; role: string } {
  const secret = process.env.JWT_REFRESH_SECRET!;
  return jwt.verify(token, secret) as { id: string; role: string };
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function activationExpiryDate(): Date {
  const hours = parseInt(process.env.ACTIVATION_TOKEN_EXPIRES_HOURS || "168", 10);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function resetTokenExpiryDate(): Date {
  const hours = parseInt(process.env.RESET_TOKEN_EXPIRES_HOURS || "1", 10);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
