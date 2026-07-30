import { Router } from "express";
import { body } from "express-validator";
import {
  listChats,
  createChat,
  getChat,
  sendMessage,
  getUsage,
  listStartupQuestions,
  saveStartupQuestions,
  listUserChats,
} from "../controllers/ava.controller";
import {
  authenticate,
  requireAdmin,
  requireProjectAccess,
  trackActivity,
} from "../middleware/auth.middleware";
import { validate } from "./validate";

const router = Router({ mergeParams: true });

router.use(authenticate, trackActivity);

// GET /api/projects/:projectId/ava/usage
router.get("/:projectId/ava/usage", requireProjectAccess, getUsage);

// GET /api/projects/:projectId/ava/startup-questions
router.get("/:projectId/ava/startup-questions", requireProjectAccess, listStartupQuestions);

// PUT /api/projects/:projectId/ava/startup-questions  (admin only)
router.put(
  "/:projectId/ava/startup-questions",
  requireProjectAccess,
  requireAdmin,
  [body("questions").isArray().withMessage("questions must be an array")],
  validate,
  saveStartupQuestions
);

// GET /api/projects/:projectId/ava/user-chats  (admin only — view all user chats)
router.get(
  "/:projectId/ava/user-chats",
  requireProjectAccess,
  requireAdmin,
  listUserChats
);

// GET /api/projects/:projectId/ava/chats
router.get("/:projectId/ava/chats", requireProjectAccess, listChats);

// POST /api/projects/:projectId/ava/chats
router.post(
  "/:projectId/ava/chats",
  requireProjectAccess,
  [body("title").optional().isString()],
  validate,
  createChat
);

// GET /api/projects/:projectId/ava/chats/:chatId
router.get("/:projectId/ava/chats/:chatId", requireProjectAccess, getChat);

// POST /api/projects/:projectId/ava/chats/:chatId/messages
router.post(
  "/:projectId/ava/chats/:chatId/messages",
  requireProjectAccess,
  [body("content").trim().notEmpty().withMessage("Message content is required")],
  validate,
  sendMessage
);

export default router;
