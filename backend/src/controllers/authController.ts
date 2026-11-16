import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { AppError } from '../utils/AppError';
import { isProduction } from '../config/env';
import * as authService from '../services/authService';

const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * The refresh token lives only in an httpOnly, sameSite cookie — never in
 * a JSON response body, and therefore never in a place client-side
 * JavaScript (or an XSS payload) can read it. The access token, by
 * contrast, IS returned in the body: it's short-lived and meant to be
 * held in memory by the frontend and sent via the Authorization header.
 */
function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    expires: expiresAt,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const user = await authService.registerUser({ name, email, password });
  sendSuccess(res, { user }, 201, 'Account created successfully');
});

export const provision = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.provisionUser(req.user!, req.body);
  sendSuccess(res, { user }, 201, 'User account provisioned successfully');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { user, tokens } = await authService.loginUser({ email, password });

  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  sendSuccess(res, { user, accessToken: tokens.accessToken }, 200, 'Logged in successfully');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawRefreshToken) {
    throw new AppError('No refresh token provided', 401);
  }

  const { user, tokens } = await authService.refreshSession(rawRefreshToken);

  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  sendSuccess(res, { user, accessToken: tokens.accessToken }, 200, 'Session refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logoutUser(rawRefreshToken);
  clearRefreshCookie(res);
  sendSuccess(res, null, 200, 'Logged out successfully');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  // req.user is guaranteed by the `authenticate` middleware.
  const user = await authService.getCurrentUser(req.user!.id);
  sendSuccess(res, { user });
});
