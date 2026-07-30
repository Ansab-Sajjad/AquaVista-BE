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
router.get("/:projectId/dashboard", requireProjectAccess, listPinnedItems);

// POST /api/projects/:projectId/dashboard/pin
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

// DELETE /api/projects/:projectId/dashboard/:itemId
router.delete("/:projectId/dashboard/:itemId", requireProjectAccess, unpinItem);

export default router;
