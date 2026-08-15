import { Router } from "express";
import { body } from "express-validator";
import { listProjects, createProject, getProject } from "../controllers/project.controller";
import { getProjectStats } from "../controllers/stats.controller";
import { getUserById, listAllUsers } from "../controllers/user.controller";
import { authenticate, requireAdmin, requireProjectAccess, trackActivity } from "../middleware/auth.middleware";
import { validate } from "./validate";

const router = Router();

router.use(authenticate, trackActivity);

// GET /api/projects
/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: List all projects accessible to the user
 *     tags: [Projects]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: List of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 */
router.get("/", listProjects);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project (admin only)
 *     tags: [Projects]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, municipality]
 *             properties:
 *               name:
 *                 type: string
 *               municipality:
 *                 type: string
 *     responses:
 *       201:
 *         description: Project created
 *       403:
 *         description: Admin access required
 */

// POST /api/projects
router.post(
  "/",
  requireAdmin,
  [
    body("name").trim().notEmpty().withMessage("Project name is required").isLength({ max: 100 }),
    body("municipality").trim().notEmpty().withMessage("Municipality is required"),
  ],
  validate,
  createProject
);

// GET /api/projects/:projectId
/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get project details
 *     tags: [Projects]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       403:
 *         description: Access denied
 */
router.get("/:projectId", requireProjectAccess, getProject);

/**
 * @swagger
 * /api/projects/{projectId}/stats:
 *   get:
 *     summary: Get project statistics
 *     tags: [Projects]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project statistics
 */
router.get("/:projectId/stats", requireProjectAccess, getProjectStats);

/**
 * @swagger
 * /api/projects/admin/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: List of all users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Admin access required
 */
router.get("/admin/users", requireAdmin, listAllUsers);

/**
 * @swagger
 * /api/projects/admin/users/{userId}:
 *   get:
 *     summary: Get user details (admin only)
 *     tags: [Users]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Admin access required
 */
router.get("/admin/users/:userId", requireAdmin, getUserById);

export default router;
