import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { RefreshTokenModel } from '../models/RefreshToken';
import { UserModel } from '../models/User';

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
    const activeUser = UserModel.findById(payload.sub).select('isActive');
    if (!payload.familyId) {
      activeUser.then((user) => {
        if (!user?.isActive) throw new AppError('Invalid or inactive account', 401);
        req.user = { id: payload.sub, role: payload.role };
        next();
      })
      .catch(next);
      return;
    }

    Promise.all([
      activeUser,
      RefreshTokenModel.exists({ userId: payload.sub, familyId: payload.familyId, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ])
      .then(([user, activeSession]) => {
        if (!user?.isActive || !activeSession) throw new AppError('Invalid or revoked session', 401);
        req.user = { id: payload.sub, role: payload.role };
        next();
      })
      .catch(next);
  } catch {
    throw new AppError('Invalid or expired access token', 401);
  }
}
