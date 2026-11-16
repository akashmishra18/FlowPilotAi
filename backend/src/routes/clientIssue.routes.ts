import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as controller from '../controllers/clientIssueController';

const router = Router();
router.use(authenticate);
router.get('/', [query('status').optional().isIn(['NEW', 'IN_PROGRESS', 'RESOLVED'])], validateRequest, controller.list);
router.post('/', [body('clientName').trim().notEmpty().isLength({ max: 120 }), body('message').trim().notEmpty().isLength({ max: 4000 }), body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']), body('receivedAt').optional().isISO8601(), body('projectId').optional({ nullable: true }).isMongoId()], validateRequest, controller.create);
router.patch('/:id', [param('id').isMongoId(), body('status').optional().isIn(['NEW', 'IN_PROGRESS', 'RESOLVED']), body('assignedTo').optional({ nullable: true }).isMongoId(), body('taskId').optional({ nullable: true }).isMongoId()], validateRequest, controller.update);
export default router;
