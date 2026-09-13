import { Router } from 'express';
import { body, param, query } from 'express-validator';
import * as employeeController from '../controllers/employeeController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

// Every employee route requires a valid access token.
router.use(authenticate);

router.post(
  '/',
  requireRole('ADMIN'),
  [
    body('userId').isMongoId().withMessage('A valid userId is required'),
    body('employeeId').trim().notEmpty().withMessage('employeeId is required'),
    body('department').trim().notEmpty().withMessage('department is required'),
    body('designation').trim().notEmpty().withMessage('designation is required'),
    body('joinedAt').isISO8601().withMessage('joinedAt must be a valid date'),
    body('phone').optional({ nullable: true }).isString().trim(),
    body('managerId').optional({ nullable: true }).isMongoId(),
  ],
  validateRequest,
  employeeController.create,
);

router.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
    query('isActive').optional().isBoolean().withMessage('isActive must be true or false'),
  ],
  validateRequest,
  employeeController.list,
);

// Must be registered before "/:id" so "me" is never parsed as an employee id.
router.get('/me', employeeController.getMe);

router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid employee id')],
  validateRequest,
  // No requireRole here: ADMIN/MANAGER may view any employee, and an
  // EMPLOYEE may view only their own record — that distinction depends on
  // the record being requested, so it's enforced in the service layer,
  // not by a static per-route role list.
  employeeController.getById,
);

router.patch(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  [
    param('id').isMongoId().withMessage('Invalid employee id'),
    body('department').optional().trim().notEmpty(),
    body('designation').optional().trim().notEmpty(),
    body('phone').optional({ nullable: true }).isString().trim(),
    body('joinedAt').optional().isISO8601(),
    body('managerId').optional({ nullable: true }).isMongoId(),
    body('skills').optional().isArray(),
    body('skills.*').optional().isString().trim(),
  ],
  validateRequest,
  employeeController.update,
);

router.patch(
  '/:id/status',
  requireRole('ADMIN'),
  [
    param('id').isMongoId().withMessage('Invalid employee id'),
    body('isActive').isBoolean().withMessage('isActive must be a boolean'),
  ],
  validateRequest,
  employeeController.updateStatus,
);

export default router;
