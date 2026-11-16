import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { authRateLimiter } from '../middleware/authRateLimiter';
import { ROLE_VALUES } from '../config/constants';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
  ],
  validateRequest,
  authController.register,
);

router.post(
  '/login',
  authRateLimiter,
  [
    body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  authController.login,
);

router.post(
  '/users',
  authenticate,
  requireRole('ADMIN'),
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('role').isIn(ROLE_VALUES).withMessage('A valid role is required'),
  ],
  validateRequest,
  authController.provision,
);

router.post('/refresh', authRateLimiter, authController.refresh);

router.post('/logout', authController.logout);

router.get('/me', authenticate, authController.me);

export default router;
