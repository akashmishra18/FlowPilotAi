import { Router } from 'express';
import { getDatabaseStatus } from '../config/database';

const router = Router();

/**
 * GET /api/health
 * Liveness + DB connectivity check.
 */
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'FlowPilot API is running',
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
  });
});

export default router;
