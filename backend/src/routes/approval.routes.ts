import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validateRequest';
import * as approvalController from '../controllers/approvalController';

const router = Router();
router.use(authenticate);

router.post(
  '/task-reassignments',
  [
    body('taskId').isMongoId().withMessage('A valid taskId is required'),
    body('assignedTo').isMongoId().withMessage('A valid employee assignedTo is required'),
  ],
  validateRequest,
  approvalController.createTaskReassignment,
);

router.get('/task-reassignments', approvalController.listTaskReassignments);
router.post('/:id/approve', [param('id').isMongoId()], validateRequest, approvalController.approveTaskReassignment);
router.post('/:id/reject', [param('id').isMongoId()], validateRequest, approvalController.rejectTaskReassignment);

export default router;
