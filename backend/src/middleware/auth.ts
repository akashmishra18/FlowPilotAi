import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';

/**
 * Expects `Authorization: Bearer <accessToken>`. On success, attaches
 * `req.user = { id, role }` for downstream RBAC middleware and controllers.
 * Never trusts anything else from the client about who they are.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }
}
