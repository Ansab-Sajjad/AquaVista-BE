import { Router } from "express";
import { authenticate, trackActivity } from "../middleware/auth.middleware";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../controllers/notification.controller";

const router = Router();

router.use(authenticate, trackActivity);

// GET /api/notifications
router.get("/", getNotifications);

// PATCH /api/notifications/read-all  — must come before /:id/read to avoid "read-all" being treated as an id
router.patch("/read-all", markAllAsRead);

// PATCH /api/notifications/:id/read
router.patch("/:id/read", markAsRead);

export default router;
