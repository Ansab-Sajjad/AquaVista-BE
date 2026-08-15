import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { User, IUser } from "../models/User.model";
import { AppError } from "../middleware/errorHandler";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateSecureToken, activationExpiryDate, resetTokenExpiryDate } from "../services/token.service";
import { sendActivationEmail, sendPasswordResetEmail } from "../services/email.service";
import { AuthRequest } from "../middleware/auth.middleware";
import { denylist } from "../services/token-denylist.service";
import { setAuthCookies, clearAuthCookies, getAccessTokenFromCookie, getRefreshTokenFromCookie } from "../services/cookie.service";
import logger from "../config/logger";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  const { name, email, company } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError("User already exists", 409);
  }

  const token = generateSecureToken();

  await User.create({
    name,
    email,
    company,
    authProvider: "local",
    role: "project_user",
    status: "pending",
    activationToken: token,
    activationTokenExpires: activationExpiryDate(),
  });

  await sendActivationEmail(email, name, token).catch(() => {});

  res.status(201).json({
    message: "Please check your email to activate your account.",
  });
}

function buildUserResponse(user: IUser) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    status: user.status,
    authProvider: user.authProvider,
    image: user.profileImage || null,
  };
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Invalid email or password", 401);
  }
  if (user.status === "pending") {
    throw new AppError("Invalid email or password", 401);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.lastActive = new Date();
  await user.save();

  setAuthCookies(res, accessToken, refreshToken);
  res.json({
    user: buildUserResponse(user),
  });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = await User.findOne({ email });

  // Always respond generically to prevent email enumeration
  const GENERIC = "If an account exists for this email, you'll receive a reset link shortly.";

  if (user) {
    const token = generateSecureToken();
    user.resetToken = token;
    user.resetTokenExpires = resetTokenExpiryDate();
    await user.save();
    try {
      await sendPasswordResetEmail(user.email, user.name, token);
    } catch (error) {
      logger.error("Password reset email delivery failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  res.json({ message: GENERIC });
}

// POST /api/auth/reset-password
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpires: { $gt: new Date() },
  }).select("+password +resetToken +resetTokenExpires");

  if (!user) throw new AppError("Reset link is invalid or has expired", 400);

  user.password = password;
  user.resetToken = undefined;
  user.resetTokenExpires = undefined;
  if (user.status === "pending") {
    user.status = "active";
  }
  await user.save();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: buildUserResponse(user), message: "Password reset successful." });
}

// POST /api/auth/activate
export async function activateAccount(req: Request, res: Response) {
  const { token, password } = req.body;

  const user = await User.findOne({
    activationToken: token,
    activationTokenExpires: { $gt: new Date() },
    status: "pending",
  }).select("+activationToken +activationTokenExpires +password");

  if (!user) throw new AppError("Activation link is invalid or has expired", 400);

  user.password = password;
  user.status = "active";
  user.activationToken = undefined;
  user.activationTokenExpires = undefined;
  await user.save();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: buildUserResponse(user), message: "Account activated." });
}

// POST /api/auth/resend-activation
export async function resendActivation(req: Request, res: Response) {
  const { email } = req.body;
  const user = await User.findOne({ email, status: "pending" }).select(
    "+activationToken +activationTokenExpires"
  );

  if (!user) {
    return res.json({ message: "If the account exists and is pending, a new activation email has been sent." });
  }

  const token = generateSecureToken();
  user.activationToken = token;
  user.activationTokenExpires = activationExpiryDate();
  await user.save();
  await sendActivationEmail(user.email, user.name, token).catch(() => {});

  res.json({ message: "Activation email resent." });
}

// POST /api/auth/logout
export async function logout(req: AuthRequest, res: Response) {
  // Revoke access token (from cookie or Bearer header)
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.split(" ")[1] : getAccessTokenFromCookie(req);
  if (token) {
    try {
      const secret = process.env.JWT_SECRET!;
      const payload = jwt.verify(token, secret) as { exp?: number };
      const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000);
      await denylist.add(token, expiresAt);
    } catch {
      // token already invalid — nothing to denylist
    }
  }

  // Also revoke refresh token if present
  const refreshToken = getRefreshTokenFromCookie(req);
  if (refreshToken) {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET!;
      const refreshPayload = jwt.verify(refreshToken, refreshSecret) as { exp?: number };
      const refreshExpiresAt = refreshPayload.exp ? new Date(refreshPayload.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await denylist.add(refreshToken, refreshExpiresAt);
    } catch {
      // refresh token already invalid
    }
  }

  if (req.user?.id) {
    await User.findByIdAndUpdate(req.user.id, { lastActive: new Date() }).catch(() => {});
  }

  clearAuthCookies(res);
  res.json({ message: "Logged out successfully." });
}

// POST /api/auth/refresh
export async function refreshToken(req: Request, res: Response) {
  const refreshCookie = getRefreshTokenFromCookie(req);
  if (!refreshCookie) {
    throw new AppError("No refresh token provided", 401);
  }

  // Check if refresh token has been revoked
  if (await denylist.has(refreshCookie)) {
    throw new AppError("Refresh token has been revoked", 401);
  }

  let payload: { id: string; role: string };
  try {
    payload = verifyRefreshToken(refreshCookie);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await User.findById(payload.id);
  if (!user || user.status !== "active") {
    throw new AppError("User not found or inactive", 401);
  }

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);
  setAuthCookies(res, newAccessToken, newRefreshToken);

  res.json({ user: buildUserResponse(user) });
}

// GET /api/auth/me
export async function getMe(req: AuthRequest, res: Response) {
  const user = await User.findById(req.user!.id).select(
    "-password -activationToken -activationTokenExpires -resetToken -resetTokenExpires"
  );
  if (!user) throw new AppError("User not found", 404);

  res.json(buildUserResponse(user));
}

// PATCH /api/auth/me
export async function updateMe(req: AuthRequest, res: Response) {
  const { name, company, username, location, birthday, gender, bio, phone, jobTitle } = req.body;
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError("User not found", 404);

  if (name !== undefined) user.name = name;
  if (company !== undefined) user.company = company;
  if (username !== undefined) user.username = username;
  if (location !== undefined) user.location = location;
  if (birthday !== undefined) user.birthday = birthday;
  if (gender !== undefined) user.gender = gender;
  if (bio !== undefined) user.bio = bio;
  if (phone !== undefined) user.phone = phone;
  if (jobTitle !== undefined) user.jobTitle = jobTitle;

  await user.save();

  res.json(buildUserResponse(user));
}

// POST /api/auth/me/avatar
export async function uploadAvatar(req: AuthRequest, res: Response) {
  if (!req.file) throw new AppError("No image uploaded", 400);
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError("User not found", 404);

  const base64 = req.file.buffer.toString("base64");
  user.profileImage = `data:${req.file.mimetype};base64,${base64}`;
  await user.save();

  res.json(buildUserResponse(user));
}

// POST /api/auth/github
export async function githubSignIn(req: Request, res: Response) {
  const { code } = req.body;
  if (!code) throw new AppError("GitHub code is required", 400);

  const clientId =
    process.env.NODE_ENV === "production"
      ? process.env.GITHUB_CLIENT_ID_PRODUCTION
      : process.env.GITHUB_CLIENT_ID_LOCALHOST;
  const clientSecret =
    process.env.NODE_ENV === "production"
      ? process.env.GITHUB_CLIENT_SECRET_PRODUCTION
      : process.env.GITHUB_CLIENT_SECRET_LOCALHOST;

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    throw new AppError(tokenData.error || "Failed to obtain GitHub access token", 400);
  }

  // Fetch user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
  });
  const githubUser = (await userRes.json()) as { email?: string; name?: string; avatar_url?: string; login?: string };

  // GitHub may not expose email publicly — fetch primary verified email
  let email = githubUser.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
    const primary = emails.find((e) => e.primary && e.verified);
    email = primary?.email;
  }

  if (!email) throw new AppError("Could not retrieve a verified email from GitHub", 400);

  const name = githubUser.name || githubUser.login || email.split("@")[0];
  const picture = githubUser.avatar_url;

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    if (!user.profileImage && picture) user.profileImage = picture;
    if (user.status === "pending") {
      user.status = "active";
      user.activationToken = undefined;
      user.activationTokenExpires = undefined;
    }
    user.lastActive = new Date();
    await user.save();
  } else {
    user = await User.create({
      name,
      email: email.toLowerCase(),
      company: "",
      authProvider: "github",
      role: "project_user",
      status: "active",
      profileImage: picture || undefined,
    });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: buildUserResponse(user) });
}

// POST /api/auth/google
export async function googleSignIn(req: Request, res: Response) {
  const { credential, flow, userInfo } = req.body;
  if (!credential) throw new AppError("Google credential is required", 400);

  let email: string | undefined;
  let name: string | undefined;
  let picture: string | undefined;

  if (flow === "access_token" && userInfo) {
    // Access token flow: userInfo already fetched client-side
    email = userInfo.email;
    name = userInfo.name;
    picture = userInfo.picture;
    if (!email) throw new AppError("Could not retrieve email from Google", 400);
  } else {
    // ID token flow: verify the credential server-side
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new AppError("Invalid Google token", 400);
    email = payload.email;
    name = payload.name;
    picture = payload.picture;
  }

  let user = await User.findOne({ email: email.toLowerCase() });

  if (user) {
    if (!user.profileImage && picture) {
      user.profileImage = picture;
    }
    if (user.status === "pending") {
      user.status = "active";
      user.activationToken = undefined;
      user.activationTokenExpires = undefined;
    }
    user.lastActive = new Date();
    await user.save();
  } else {
    user = await User.create({
      name: name || email.split("@")[0],
      email: email.toLowerCase(),
      company: "",
      authProvider: "google",
      role: "project_user",
      status: "active",
      profileImage: picture || undefined,
    });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ user: buildUserResponse(user) });
}
