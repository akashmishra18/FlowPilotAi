import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as taskController from '../controllers/taskController';
import * as messagingController from '../controllers/messagingController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateRequest } from '../middleware/validateRequest';
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from '../config/constants';

const router = Router();

// Every task route requires a valid access token.
router.use(authenticate);

const tagRules = [
  body('tags').optional().isArray({ max: 10 }).withMessage('tags must be an array of at most 10 items'),
  body('tags.*').optional().isString().trim().isLength({ min: 1, max: 30 }).withMessage('Each tag must be 1-30 characters'),
];

router.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  [
    body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 200 }),
    body('description').optional().isString().trim().isLength({ max: 5000 }),
    body('projectId').isMongoId().withMessage('A valid projectId is required'),
    body('assignedTo').optional({ nullable: true }).isMongoId().withMessage('assignedTo must be a valid employee id'),
    body('priority').optional().isIn(TASK_PRIORITY_VALUES).withMessage('Invalid priority'),
    body('status').optional().isIn(TASK_STATUS_VALUES).withMessage('Invalid status'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid date'),
    ...tagRules,
  ],
  validateRequest,
  taskController.create,
);

router.get(
  '/overdue-assistant',
  taskController.overdueAssistant,
);

router.get('/:id/reminder-preview', [param('id').isMongoId().withMessage('Invalid task id')], validateRequest, messagingController.reminderPreview);
router.post('/:id/reminders', [param('id').isMongoId().withMessage('Invalid task id')], validateRequest, messagingController.sendReminder);

router.get(
  '/',
  // No requireRole: every role may list, the service scopes what comes back
  // (ADMIN: all, MANAGER: their projects' tasks, others: tasks assigned to them).
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('projectId').optional().isMongoId(),
    query('assignedTo').optional().isMongoId(),
    query('status').optional().isIn(TASK_STATUS_VALUES),
    query('priority').optional().isIn(TASK_PRIORITY_VALUES),
    query('dueDateFrom').optional().isISO8601(),
    query('dueDateTo').optional().isISO8601(),
    query('overdue').optional().isBoolean(),
    query('search').optional().isString().trim().isLength({ max: 100 }),
  ],
  validateRequest,
  taskController.list,
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid task id')],
  validateRequest,
  // Visibility (admin / managing manager / assignee) is a per-record check in the service.
  taskController.getById,
);

router.patch(
  '/:id',
  // No requireRole: an assignee may update their own task's status/description.
  // Field-level and ownership rules are enforced in the service.
  [
    param('id').isMongoId().withMessage('Invalid task id'),
    body('projectId').not().exists().withMessage('projectId cannot be changed'),
    body('createdBy').not().exists().withMessage('createdBy cannot be changed'),
    body('title').optional().trim().notEmpty().isLength({ max: 200 }),
    body('description').optional().isString().trim().isLength({ max: 5000 }),
    body('assignedTo').optional({ nullable: true }).isMongoId().withMessage('assignedTo must be a valid employee id'),
    body('priority').optional().isIn(TASK_PRIORITY_VALUES).withMessage('Invalid priority'),
    body('status').optional().isIn(TASK_STATUS_VALUES).withMessage('Invalid status'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('dueDate must be a valid date'),
    ...tagRules,
  ],
  validateRequest,
  taskController.update,
);

router.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  [param('id').isMongoId().withMessage('Invalid task id')],
  validateRequest,
  taskController.remove,
);

export default router;
