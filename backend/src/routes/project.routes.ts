import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as projectController from '../controllers/projectController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateRequest } from '../middleware/validateRequest';
import { PROJECT_STATUS_VALUES, PROJECT_PRIORITY_VALUES } from '../config/constants';

const router = Router();

// Every project route requires a valid access token.
router.use(authenticate);

router.post(
  '/',
  requireRole('ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('projectCode').trim().notEmpty().withMessage('projectCode is required'),
    body('description').optional().isString().trim(),
    body('status').optional().isIn(PROJECT_STATUS_VALUES).withMessage('Invalid status'),
    body('priority').optional().isIn(PROJECT_PRIORITY_VALUES).withMessage('Invalid priority'),
    body('clientName').optional().isString().trim(),
    body('startDate').isISO8601().withMessage('startDate must be a valid date'),
    body('deadline').optional({ nullable: true }).isISO8601().withMessage('deadline must be a valid date'),
    body('managerId').isMongoId().withMessage('A valid managerId is required'),
    body('members').optional().isArray().withMessage('members must be an array'),
    body('members.*').optional().isMongoId().withMessage('Each member must be a valid employee id'),
  ],
  validateRequest,
  projectController.create,
);

router.get(
  '/',
  // No requireRole here: every authenticated role can list, but the
  // service layer scopes *which* projects come back (ADMIN: all,
  // MANAGER: managed, everyone else: projects they are a member of).
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(PROJECT_STATUS_VALUES),
    query('priority').optional().isIn(PROJECT_PRIORITY_VALUES),
    query('managerId').optional().isMongoId(),
    query('isActive').optional().isBoolean(),
  ],
  validateRequest,
  projectController.list,
);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid project id')],
  validateRequest,
  // No requireRole here either — visibility (ADMIN/managing-MANAGER/
  // member) is a per-record check made in the service layer.
  projectController.getById,
);

router.patch(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  [
    param('id').isMongoId().withMessage('Invalid project id'),
    body('name').optional().trim().notEmpty(),
    body('description').optional().isString().trim(),
    body('priority').optional().isIn(PROJECT_PRIORITY_VALUES).withMessage('Invalid priority'),
    body('clientName').optional().isString().trim(),
    body('startDate').optional().isISO8601(),
    body('deadline').optional({ nullable: true }).isISO8601(),
  ],
  validateRequest,
  projectController.update,
);

router.patch(
  '/:id/status',
  requireRole('ADMIN', 'MANAGER'),
  [
    param('id').isMongoId().withMessage('Invalid project id'),
    body('status').isIn(PROJECT_STATUS_VALUES).withMessage('Invalid status'),
  ],
  validateRequest,
  projectController.updateStatus,
);

router.patch(
  '/:id/manager',
  // ADMIN only — reassigning a project's manager is an ownership change,
  // not day-to-day project management (see projectService for rationale).
  requireRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid project id'),
    body('managerId').isMongoId().withMessage('A valid managerId is required'),
  ],
  validateRequest,
  projectController.updateManager,
);

router.post(
  '/:id/members',
  requireRole('ADMIN', 'MANAGER'),
  [
    param('id').isMongoId().withMessage('Invalid project id'),
    body('employeeId').isMongoId().withMessage('A valid employeeId is required'),
  ],
  validateRequest,
  projectController.addMember,
);

router.delete(
  '/:id/members/:employeeId',
  requireRole('ADMIN', 'MANAGER'),
  [
    param('id').isMongoId().withMessage('Invalid project id'),
    param('employeeId').isMongoId().withMessage('Invalid employee id'),
  ],
  validateRequest,
  projectController.removeMember,
);

router.patch(
  '/:id/deactivate',
  requireRole('ADMIN'),
  [param('id').isMongoId().withMessage('Invalid project id')],
  validateRequest,
  projectController.deactivate,
);

export default router;
