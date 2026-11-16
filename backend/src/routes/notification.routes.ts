import { Router } from 'express';
import { param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as messagingController from '../controllers/messagingController';

const router = Router();
router.use(authenticate);
router.get('/', messagingController.notifications);
router.patch('/:id/read', [param('id').isMongoId()], validateRequest, messagingController.markNotificationRead);
export default router;
