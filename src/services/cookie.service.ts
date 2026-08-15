import { Response } from "express";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const accessMaxAge = parseExpiryToMs(process.env.JWT_EXPIRES_IN || "15m");
  const refreshMaxAge = parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || "7d");

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions(accessMaxAge));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions(refreshMaxAge));
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/", httpOnly: true, sameSite: "lax" });
}

export function getAccessTokenFromCookie(req: { cookies?: Record<string, string> }): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] || null;
}

export function getRefreshTokenFromCookie(req: { cookies?: Record<string, string> }): string | null {
  return req.cookies?.[REFRESH_TOKEN_COOKIE] || null;
}

function parseExpiryToMs(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!match) return 15 * 60 * 1000; // default 15m

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 60_000);
}
