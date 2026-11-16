import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as controller from '../controllers/agentWorkflowController';

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.post('/stream', [body('request').isString().trim().notEmpty().isLength({ max: 1000 })], validateRequest, controller.stream);
router.post('/', [body('request').isString().trim().notEmpty().isLength({ max: 1000 })], validateRequest, controller.submit);
export default router;
