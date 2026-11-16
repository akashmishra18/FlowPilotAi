import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as aiUsageController from '../controllers/aiUsageController';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  [query('period').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('period must be daily, weekly, or monthly')],
  validateRequest,
  aiUsageController.analytics,
);

export default router;
