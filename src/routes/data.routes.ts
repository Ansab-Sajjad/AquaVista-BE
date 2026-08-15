import { Router } from "express";
import { body } from "express-validator";
import {
  listDataFiles,
  uploadDataFile,
  downloadDataFile,
  previewDataFile,
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
/**
 * @swagger
 * /api/projects/{projectId}/data:
 *   get:
 *     summary: List uploaded data files for a project
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of data files
 */
router.get("/:projectId/data", requireProjectAccess, listDataFiles);

/**
 * @swagger
 * /api/projects/{projectId}/data:
 *   post:
 *     summary: Upload a data file (admin only)
 *     tags: [Data]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               fileType:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded
 *       403:
 *         description: Admin access required
 */
router.post(
  "/:projectId/data",
  requireProjectAccess,
  requireAdmin,
  uploadMiddleware,
  [body("fileType").notEmpty().withMessage("fileType is required")],
  validate,
  uploadDataFile
);

/**
 * @swagger
 * /api/projects/{projectId}/data/{fileId}/download:
 *   get:
 *     summary: Download a data file
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File binary
 */
router.get(
  "/:projectId/data/:fileId/download",
  requireProjectAccess,
  downloadDataFile
);

/**
 * @swagger
 * /api/projects/{projectId}/data/{fileId}/preview:
 *   get:
 *     summary: Preview a data file
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File preview content
 */
router.get(
  "/:projectId/data/:fileId/preview",
  requireProjectAccess,
  previewDataFile
);

/**
 * @swagger
 * /api/projects/{projectId}/data/{fileId}:
 *   delete:
 *     summary: Delete a data file (admin only)
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File deleted
 */
router.delete(
  "/:projectId/data/:fileId",
  requireProjectAccess,
  requireAdmin,
  deleteDataFile
);

// Templates — accessible to any authenticated user with project access
// GET /api/projects/:projectId/templates
/**
 * @swagger
 * /api/projects/{projectId}/templates:
 *   get:
 *     summary: List available templates
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of templates
 */
router.get("/:projectId/templates", requireProjectAccess, listTemplates);

/**
 * @swagger
 * /api/projects/{projectId}/templates/{templateId}/download:
 *   get:
 *     summary: Download a template file
 *     tags: [Data]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template file binary
 */
router.get(
  "/:projectId/templates/:templateId/download",
  requireProjectAccess,
  downloadTemplate
);

export default router;
