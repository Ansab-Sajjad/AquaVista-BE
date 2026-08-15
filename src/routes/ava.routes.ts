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
  pinMessage,
  unpinMessage,
  getPinnedMessages,
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
/**
 * @swagger
 * /api/projects/{projectId}/ava/usage:
 *   get:
 *     summary: Get AVA usage statistics
 *     tags: [AVA]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage statistics
 */
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
/**
 * @swagger
 * /api/projects/{projectId}/ava/chats:
 *   get:
 *     summary: List AVA chats for a project
 *     tags: [AVA]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of chats
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Chat'
 */
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
/**
 * @swagger
 * /api/projects/{projectId}/ava/chats/{chatId}/messages:
 *   post:
 *     summary: Send a message in an AVA chat
 *     tags: [AVA]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: AVA response
 */
router.post(
  "/:projectId/ava/chats/:chatId/messages",
  requireProjectAccess,
  [body("content").trim().notEmpty().withMessage("Message content is required")],
  validate,
  sendMessage
);

// POST /api/projects/:projectId/ava/chats/:chatId/messages/:messageId/pin
router.post(
  "/:projectId/ava/chats/:chatId/messages/:messageId/pin",
  requireProjectAccess,
  [
    body("content").optional().trim(),
    body("type").optional().isIn(["narrative", "table", "chart"]),
    body("title").optional().trim(),
  ],
  validate,
  pinMessage
);

// DELETE /api/projects/:projectId/ava/chats/:chatId/messages/:messageId/unpin
router.delete(
  "/:projectId/ava/chats/:chatId/messages/:messageId/unpin",
  requireProjectAccess,
  unpinMessage
);

// GET /api/projects/:projectId/ava/chats/:chatId/pinned-messages
router.get(
  "/:projectId/ava/chats/:chatId/pinned-messages",
  requireProjectAccess,
  getPinnedMessages
);

export default router;
