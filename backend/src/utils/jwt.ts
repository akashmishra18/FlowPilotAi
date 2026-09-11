import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../config/constants';

/**
 * Deliberately minimal payload: subject (user id) and role only. Enough for
 * authorization decisions; nothing else identity-related (no name, no email,
 * no permissions list) so the token itself leaks as little as possible if
 * intercepted, and so role changes/deactivation are re-checked against the
 * database on refresh rather than trusted indefinitely from an old token.
 */
export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string;
  type: 'refresh';
}

export function signAccessToken(userId: string, role: Role): string {
  const payload: Omit<AccessTokenPayload, keyof JwtPayload> = { sub: userId, role, type: 'access' };
  const options: SignOptions = { expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.secret, options);
}

export function signRefreshToken(userId: string): string {
  const payload: Omit<RefreshTokenPayload, keyof JwtPayload> = { sub: userId, type: 'refresh' };
  const options: SignOptions = { expiresIn: env.jwt.refreshExpiresIn as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.jwt.refreshSecret, options);
}

/** Throws if the token is invalid, expired, or not an access token. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwt.secret) as AccessTokenPayload;
  if (decoded.type !== 'access') {
    throw new Error('Not an access token');
  }
  return decoded;
}

/** Throws if the token is invalid, expired, or not a refresh token. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Not a refresh token');
  }
  return decoded;
}
