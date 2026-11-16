import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateRequest } from '../middleware/validateRequest';
import * as auditController from '../controllers/auditController';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));
router.get('/', [query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })], validateRequest, auditController.list);
export default router;
