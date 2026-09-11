import { NextFunction, Request, Response } from 'express';
import { Role } from '../config/constants';
import { AppError } from '../utils/AppError';

/**
 * requireRole('ADMIN', 'MANAGER') — must run AFTER `authenticate`, since it
 * reads `req.user` set by that middleware. Explicit per-route allow-lists
 * (rather than a numeric role-rank check) so every route's authorization
 * is visible directly at its definition, e.g.:
 *
 *   router.delete('/:id', authenticate, requireRole('ADMIN'), controller);
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Defensive: should never happen if `authenticate` ran first.
      throw new AppError('Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('You do not have permission to perform this action', 403);
    }

    next();
  };
}
