import { Router } from "express";
import { getGlobalStats } from "../controllers/stats.controller";
import { authenticate, trackActivity } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate, trackActivity);

// GET /api/stats/overview — global aggregated stats for the requesting user
/**
 * @swagger
 * /api/stats/overview:
 *   get:
 *     summary: Get global aggregated statistics for the requesting user
 *     tags: [Stats]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Global statistics
 */
router.get("/overview", getGlobalStats);

export default router;
