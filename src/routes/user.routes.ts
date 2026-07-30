import { Router } from "express";
import { body } from "express-validator";
import {
  listProjectUsers,
  addProjectUser,
  removeProjectUser,
  resendUserActivation,
} from "../controllers/user.controller";
import {
  authenticate,
  requireAdmin,
  requireProjectAccess,
  trackActivity,
} from "../middleware/auth.middleware";
import { validate } from "./validate";

const router = Router({ mergeParams: true });

router.use(authenticate, trackActivity);

// GET /api/projects/:projectId/users
router.get("/:projectId/users", requireProjectAccess, requireAdmin, listProjectUsers);

// POST /api/projects/:projectId/users
router.post(
  "/:projectId/users",
  requireProjectAccess,
  requireAdmin,
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  addProjectUser
);

// DELETE /api/projects/:projectId/users/:userId
router.delete(
  "/:projectId/users/:userId",
  requireProjectAccess,
  requireAdmin,
  removeProjectUser
);

// POST /api/projects/:projectId/users/:userId/resend-activation
router.post(
  "/:projectId/users/:userId/resend-activation",
  requireProjectAccess,
  requireAdmin,
  resendUserActivation
);

export default router;
