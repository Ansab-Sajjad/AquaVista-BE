import { Router } from "express";
import { body } from "express-validator";
import { listProjects, createProject, getProject } from "../controllers/project.controller";
import { getUserById, listAllUsers } from "../controllers/user.controller";
import { authenticate, requireAdmin, requireProjectAccess, trackActivity } from "../middleware/auth.middleware";
import { validate } from "./validate";

const router = Router();

router.use(authenticate, trackActivity);

// GET /api/projects
router.get("/", listProjects);

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
router.get("/:projectId", requireProjectAccess, getProject);

// GET /api/users — all users for the global Users page
router.get("/admin/users/:userId", requireAdmin, getUserById);
router.get("/admin/users", requireAdmin, listAllUsers);

export default router;
