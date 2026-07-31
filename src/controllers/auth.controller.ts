import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.model";
import { AppError } from "../middleware/errorHandler";
import { generateAccessToken, generateSecureToken, activationExpiryDate, resetTokenExpiryDate } from "../services/token.service";
import { sendActivationEmail, sendPasswordResetEmail } from "../services/email.service";
import { AuthRequest } from "../middleware/auth.middleware";
import { denylist } from "../services/token-denylist.service";

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
    password: generateSecureToken(), // placeholder; replaced on activation
    role: "project_user",
    status: "pending",
    activationToken: token,
    activationTokenExpires: activationExpiryDate(),
  });

  await sendActivationEmail(email, name, token).catch(() => {});

  res.status(201).json({
    message: "Account created. Please check your email to activate your account.",
  });
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

  const token = generateAccessToken(user);
  user.lastActive = new Date();
  await user.save();

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
}

// POST /api/auth/forgot-password
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const user = await User.findOne({ email, status: "active" });

  // Always respond generically to prevent email enumeration
  const GENERIC = "If an account exists for this email, you'll receive a reset link shortly.";

  if (user) {
    const token = generateSecureToken();
    user.resetToken = token;
    user.resetTokenExpires = resetTokenExpiryDate();
    await user.save();
    await sendPasswordResetEmail(user.email, user.name, token).catch(() => {});
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
  await user.save();

  const accessToken = generateAccessToken(user);
  res.json({ token: accessToken, message: "Password reset successful." });
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
  res.json({ token: accessToken, message: "Account activated." });
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
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const secret = process.env.JWT_SECRET!;
      const payload = jwt.verify(token, secret) as { exp?: number };
      const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      denylist.add(token, expiresAt);
    } catch {
      // token already invalid — nothing to denylist
    }
  }

  if (req.user?.id) {
    await User.findByIdAndUpdate(req.user.id, { lastActive: new Date() }).catch(() => {});
  }

  res.json({ message: "Logged out successfully." });
}

// GET /api/auth/me
export async function getMe(req: AuthRequest, res: Response) {
  const user = await User.findById(req.user!.id).select(
    "-password -activationToken -activationTokenExpires -resetToken -resetTokenExpires"
  );
  if (!user) throw new AppError("User not found", 404);

  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    status: user.status,
  });
}

// PATCH /api/auth/me
export async function updateMe(req: AuthRequest, res: Response) {
  const { name, company } = req.body;
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError("User not found", 404);

  if (name !== undefined) user.name = name;
  if (company !== undefined) user.company = company;

  await user.save();

  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    status: user.status,
  });
}
