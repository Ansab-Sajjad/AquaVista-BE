import { Response } from "express";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * In production the frontend (aqua-vista-fe.vercel.app) and backend are on
 * different sites, so cookies must use SameSite=None + Secure to be sent on
 * cross-site requests. SameSite=Lax would cause the browser to strip the
 * refresh_token cookie on the cross-site POST /api/auth/refresh call.
 */
function cookieOptions(maxAgeMs: number) {
  const production = isProduction();
  return {
    httpOnly: true,
    secure: production,
    sameSite: (production ? "none" : "lax") as "none" | "lax",
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
  const production = isProduction();
  const clearOptions = {
    path: "/",
    httpOnly: true,
    secure: production,
    sameSite: (production ? "none" : "lax") as "none" | "lax",
  };
  res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearOptions);
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
