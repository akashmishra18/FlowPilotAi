import { Router } from 'express';
import { body } from 'express-validator';
import * as authController from '../controllers/authController';
import { validateRequest } from '../middleware/validateRequest';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/authRateLimiter';

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

router.post('/refresh', authRateLimiter, authController.refresh);

router.post('/logout', authController.logout);

router.get('/me', authenticate, authController.me);

export default router;
