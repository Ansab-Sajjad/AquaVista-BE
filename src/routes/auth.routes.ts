import { Router, Response } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  activateAccount,
  resendActivation,
  getMe,
  updateMe,
  uploadAvatar,
  googleSignIn,
  githubSignIn,
  refreshToken,
} from "../controllers/auth.controller";
import { authenticate, AuthRequest } from "../middleware/auth.middleware";
import { avatarUploadMiddleware } from "../middleware/upload.middleware";
import { authRateLimiter } from "../middleware/rateLimiter";
import { User } from "../models/User.model";
import { AppError } from "../middleware/errorHandler";
import { validate } from "./validate";

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, company]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               company:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created, activation email sent
 *       409:
 *         description: User already exists
 */
router.post(
  "/register",
  authRateLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required").isLength({ min: 3 }).withMessage("Name must be at least 3 characters"),
    body("email").isEmail().withMessage("Valid email required"),
    body("company").trim().notEmpty().withMessage("Company / organization is required").isLength({ min: 3 }).withMessage("Company must be at least 3 characters"),
  ],
  validate,
  register
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, sets httpOnly cookies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */
router.post(
  "/login",
  authRateLimiter,
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  validate,
  login
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Generic response (prevents email enumeration)
 */
router.post(
  "/forgot-password",
  authRateLimiter,
  [body("email").isEmail()],
  validate,
  forgotPassword
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with a reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful, sets httpOnly cookies
 *       400:
 *         description: Invalid or expired reset link
 */
router.post(
  "/reset-password",
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  resetPassword
);

/**
 * @swagger
 * /api/auth/activate:
 *   post:
 *     summary: Activate account with activation token and set password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Account activated, sets httpOnly cookies
 *       400:
 *         description: Invalid or expired activation link
 */
router.post(
  "/activate",
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  activateAccount
);

router.post(
  "/resend-activation",
  [body("email").isEmail()],
  validate,
  resendActivation
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and revoke tokens
 *     tags: [Auth]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Logged out, cookies cleared
 */
router.post("/logout", authenticate, logout);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token cookie
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: New access token issued, sets httpOnly cookies
 *       401:
 *         description: No or invalid refresh token
 */
router.post("/refresh", refreshToken);

router.post(
  "/google",
  authRateLimiter,
  [body("credential").notEmpty().withMessage("Google credential is required")],
  validate,
  googleSignIn
);

router.post(
  "/github",
  authRateLimiter,
  [body("code").notEmpty().withMessage("GitHub code is required")],
  validate,
  githubSignIn
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get("/me", authenticate, getMe);
router.patch(
  "/me",
  authenticate,
  [
    body("name").optional().trim().isLength({ min: 1 }).withMessage("Name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email required"),
    body("company").optional().trim(),
    body("username").optional().trim(),
    body("location").optional().trim(),
    body("birthday").optional().trim(),
    body("gender").optional().trim(),
    body("bio").optional().trim(),
    body("phone").optional().trim(),
    body("jobTitle").optional().trim(),
  ],
  validate,
  updateMe
);
router.post("/me/avatar", authenticate, avatarUploadMiddleware, uploadAvatar);

// PATCH /me/password
router.patch(
  "/me/password",
  authenticate,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user!.id).select("+password");
    if (!user) throw new AppError("User not found", 404);

    if (!(await user.comparePassword(currentPassword))) {
      throw new AppError("Current password is incorrect", 400);
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully." });
  }
);

export default router;
