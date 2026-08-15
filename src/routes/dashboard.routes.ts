import { Router } from "express";
import { body } from "express-validator";
import {
  listPinnedItems,
  pinItem,
  unpinItem,
} from "../controllers/dashboard.controller";
import {
  authenticate,
  requireProjectAccess,
  trackActivity,
} from "../middleware/auth.middleware";
import { validate } from "./validate";

const router = Router({ mergeParams: true });

router.use(authenticate, trackActivity);

// GET /api/projects/:projectId/dashboard
/**
 * @swagger
 * /api/projects/{projectId}/dashboard:
 *   get:
 *     summary: List pinned dashboard items
 *     tags: [Dashboard]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of pinned items
 */
router.get("/:projectId/dashboard", requireProjectAccess, listPinnedItems);

/**
 * @swagger
 * /api/projects/{projectId}/dashboard/pin:
 *   post:
 *     summary: Pin an item to the project dashboard
 *     tags: [Dashboard]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chatId, title, type, sourceQuestion, content]
 *             properties:
 *               chatId:
 *                 type: string
 *               title:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [narrative, table, chart]
 *               sourceQuestion:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Item pinned
 */
router.post(
  "/:projectId/dashboard/pin",
  requireProjectAccess,
  [
    body("chatId").notEmpty().withMessage("chatId is required"),
    body("title").trim().notEmpty().withMessage("title is required"),
    body("type")
      .isIn(["narrative", "table", "chart"])
      .withMessage("type must be narrative, table, or chart"),
    body("sourceQuestion").trim().notEmpty().withMessage("sourceQuestion is required"),
    body("content").trim().notEmpty().withMessage("content is required"),
  ],
  validate,
  pinItem
);

/**
 * @swagger
 * /api/projects/{projectId}/dashboard/{itemId}:
 *   delete:
 *     summary: Unpin a dashboard item
 *     tags: [Dashboard]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item unpinned
 */
router.delete("/:projectId/dashboard/:itemId", requireProjectAccess, unpinItem);

export default router;
