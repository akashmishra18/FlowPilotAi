import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

/**
 * GET /api/health
 * Minimal liveness check. Kept deliberately simple in Phase 1 —
 * no DB connection exists yet, so `database` reports "not_connected_yet"
 * rather than attempting a real check.
 */
router.get('/', (_req, res) => {
  const dbStates = ['not_connected_yet', 'connected', 'connecting', 'disconnecting'];

  res.status(200).json({
    success: true,
    message: 'FlowPilot API is running',
    timestamp: new Date().toISOString(),
    database: dbStates[mongoose.connection.readyState] ?? 'unknown',
  });
});

export default router;
