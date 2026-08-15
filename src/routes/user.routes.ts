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

/**
 * @swagger
 * /api/projects/{projectId}/users:
 *   get:
 *     summary: List project users (admin only)
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of project users
 */
router.get("/:projectId/users", requireProjectAccess, requireAdmin, listProjectUsers);

// POST /api/projects/:projectId/users
/**
 * @swagger
 * /api/projects/{projectId}/users:
 *   post:
 *     summary: Invite a user to a project (admin only)
 *     tags: [Users]
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
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: User invited
 */
router.post(
  "/:projectId/users",
  requireProjectAccess,
  requireAdmin,
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  addProjectUser
);

/**
 * @swagger
 * /api/projects/{projectId}/users/{userId}:
 *   delete:
 *     summary: Remove a user from a project (admin only)
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User removed
 */
router.delete(
  "/:projectId/users/:userId",
  requireProjectAccess,
  requireAdmin,
  removeProjectUser
);

/**
 * @swagger
 * /api/projects/{projectId}/users/{userId}/resend-activation:
 *   post:
 *     summary: Resend activation email to a project user (admin only)
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Activation email resent
 */
router.post(
  "/:projectId/users/:userId/resend-activation",
  requireProjectAccess,
  requireAdmin,
  resendUserActivation
);

export default router;
