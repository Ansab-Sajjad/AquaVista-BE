import { Router } from "express";
import { body } from "express-validator";
import {
  listDataFiles,
  uploadDataFile,
  downloadDataFile,
  deleteDataFile,
  listTemplates,
  downloadTemplate,
} from "../controllers/data.controller";
import {
  authenticate,
  requireAdmin,
  requireProjectAccess,
  trackActivity,
} from "../middleware/auth.middleware";
import { uploadMiddleware } from "../middleware/upload.middleware";
import { validate } from "./validate";

const router = Router({ mergeParams: true });

router.use(authenticate, trackActivity);

// GET /api/projects/:projectId/data
router.get("/:projectId/data", requireProjectAccess, listDataFiles);

// POST /api/projects/:projectId/data  (admin only)
router.post(
  "/:projectId/data",
  requireProjectAccess,
  requireAdmin,
  uploadMiddleware,
  [body("fileType").notEmpty().withMessage("fileType is required")],
  validate,
  uploadDataFile
);

// GET /api/projects/:projectId/data/:fileId/download
router.get(
  "/:projectId/data/:fileId/download",
  requireProjectAccess,
  downloadDataFile
);

// DELETE /api/projects/:projectId/data/:fileId  (admin only)
router.delete(
  "/:projectId/data/:fileId",
  requireProjectAccess,
  requireAdmin,
  deleteDataFile
);

// Templates — accessible to any authenticated user with project access
// GET /api/projects/:projectId/templates
router.get("/:projectId/templates", requireProjectAccess, listTemplates);

// GET /api/projects/:projectId/templates/:templateId/download
router.get(
  "/:projectId/templates/:templateId/download",
  requireProjectAccess,
  downloadTemplate
);

export default router;
