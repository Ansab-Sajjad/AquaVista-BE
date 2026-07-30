import { Router } from "express";
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
  updatePassword,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authRateLimiter } from "../middleware/rateLimiter";
import { validate } from "./validate";

const router = Router();

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

router.post(
  "/forgot-password",
  authRateLimiter,
  [body("email").isEmail()],
  validate,
  forgotPassword
);

router.post(
  "/reset-password",
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  ],
  validate,
  resetPassword
);

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

router.post("/logout", authenticate, logout);

router.get("/me", authenticate, getMe);

router.patch(
  "/me",
  authenticate,
  [
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty").isLength({ min: 2 }),
    body("company").optional().trim(),
    body("phone").optional().trim(),
    body("jobTitle").optional().trim(),
    body("username").optional().trim(),
    body("location").optional().trim(),
    body("birthday").optional().trim(),
    body("gender").optional().trim(),
    body("bio").optional().trim(),
  ],
  validate,
  updateMe
);

router.patch(
  "/me/password",
  authenticate,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 8 }).withMessage("New password must be at least 8 characters"),
  ],
  validate,
  updatePassword
);

export default router;
