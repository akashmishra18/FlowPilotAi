import { UserModel, UserDocument } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { hashPassword, comparePassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sha256 } from '../utils/hash';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { Role } from '../config/constants';
import { recordAuditEvent, recordAuditFailure } from './auditService';
import ms from 'ms';
import { randomUUID } from 'crypto';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface ProvisionInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/**
 * Registration always creates an EMPLOYEE. Role escalation (MANAGER,
 * TEAM_LEAD, ADMIN) is never accepted from client input — it happens
 * through an authenticated admin action (Phase 3+) or the seed script.
 * This prevents self-registration from granting elevated privileges.
 */
export async function registerUser(input: RegisterInput): Promise<UserDocument> {
  const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: 'EMPLOYEE',
  });

  await recordAuditEvent({ action: 'USER_REGISTERED', targetType: 'User', targetId: user._id.toString(), outcome: 'SUCCESS', after: { role: user.role, isActive: user.isActive } });
  return user;
}

/** Creates a user account with an explicitly chosen role; only ADMIN callers may invoke this. */
export async function provisionUser(requestingUser: { id: string; role: Role }, input: ProvisionInput): Promise<UserDocument> {
  if (requestingUser.role !== 'ADMIN') throw new AppError('Only an admin can provision user accounts', 403);
  const email = input.email.toLowerCase();
  const existing = await UserModel.findOne({ email });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await hashPassword(input.password);
  const user = await UserModel.create({ name: input.name, email, passwordHash, role: input.role, isActive: true });
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'USER_PROVISIONED', targetType: 'User', targetId: user._id.toString(), outcome: 'SUCCESS', after: { role: user.role, isActive: user.isActive } });
  return user;
}

async function issueTokenPair(user: UserDocument, familyId: string = randomUUID(), tokenId: string = randomUUID()): Promise<TokenPair> {
  const accessToken = signAccessToken(user._id.toString(), user.role, familyId);
  const refreshToken = signRefreshToken(user._id.toString(), tokenId, familyId);

  const refreshTokenExpiresAt = new Date(Date.now() + ms(env.jwt.refreshExpiresIn as ms.StringValue));

  await RefreshTokenModel.create({
    tokenId,
    familyId,
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshTokenExpiresAt,
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

export async function loginUser(input: LoginInput): Promise<{ user: UserDocument; tokens: TokenPair }> {
  const user = await UserModel.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');

  // Same error for "no such user" and "wrong password" — do not reveal
  // which one it was, to avoid leaking which emails are registered.
  if (!user) {
    await recordAuditFailure({ action: 'AUTH_LOGIN_FAILED', targetType: 'User', targetId: 'unknown', error: { code: '401', message: 'Invalid credentials' } });
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    await recordAuditFailure({ actorUserId: user._id.toString(), actorRole: user.role, action: 'AUTH_LOGIN_FAILED', targetType: 'User', targetId: user._id.toString(), error: { code: '403', message: 'Inactive account' } });
    throw new AppError('This account has been deactivated. Contact your administrator.', 403);
  }

  const passwordMatches = await comparePassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    await recordAuditFailure({ action: 'AUTH_LOGIN_FAILED', targetType: 'User', targetId: 'unknown', error: { code: '401', message: 'Invalid credentials' } });
    throw new AppError('Invalid email or password', 401);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user);
  await recordAuditEvent({ actorUserId: user._id.toString(), actorRole: user.role, action: 'AUTH_LOGIN', targetType: 'User', targetId: user._id.toString(), outcome: 'SUCCESS' });
  return { user, tokens };
}

/**
 * Refresh-token rotation: the presented token is verified, matched against
 * its stored hash, and — if valid and not already revoked/expired — revoked
 * and replaced with a brand new refresh token in the same operation. This
 * means a stolen refresh token can only be used once before the rotation
 * invalidates it, limiting the damage window of a leaked token.
 */
export async function refreshSession(rawRefreshToken: string): Promise<{ user: UserDocument; tokens: TokenPair }> {
  let userId: string;
  let tokenId: string | undefined;
  let familyId: string | undefined;
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    userId = payload.sub;
    tokenId = payload.jti;
    familyId = payload.familyId;
  } catch {
    await recordAuditFailure({ action: 'AUTH_REFRESH_FAILED', targetType: 'Session', targetId: 'unknown', error: { code: '401', message: 'Malformed or expired refresh token' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  if (!tokenId || !familyId) {
    await recordAuditFailure({ action: 'AUTH_REFRESH_FAILED', targetType: 'Session', targetId: 'unknown', error: { code: '401', message: 'Malformed refresh token' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const tokenHash = sha256(rawRefreshToken);
  const storedToken = await RefreshTokenModel.findOne({ tokenId, tokenHash, userId, familyId });

  if (!storedToken || storedToken.expiresAt.getTime() < Date.now()) {
    await recordAuditFailure({ action: 'AUTH_REFRESH_FAILED', targetType: 'Session', targetId: familyId, error: { code: '401', message: 'Expired or unknown refresh token' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  if (storedToken.revokedAt) {
    await RefreshTokenModel.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await recordAuditFailure({ actorUserId: userId, action: 'AUTH_REFRESH_REPLAYED', targetType: 'Session', targetId: familyId, error: { code: '401', message: 'Refresh token replay detected' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) {
    await recordAuditFailure({ actorUserId: userId, action: 'AUTH_REFRESH_FAILED', targetType: 'User', targetId: userId, error: { code: '401', message: 'Inactive or missing account' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const replacementTokenId = randomUUID();
  const now = new Date();
  const consumed = await RefreshTokenModel.findOneAndUpdate(
    { _id: storedToken._id, tokenId, tokenHash, familyId, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, replacedByTokenId: replacementTokenId } },
    { new: true },
  );

  if (!consumed) {
    await RefreshTokenModel.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } });
    await recordAuditFailure({ actorUserId: userId, action: 'AUTH_REFRESH_REPLAYED', targetType: 'Session', targetId: familyId, error: { code: '401', message: 'Concurrent refresh reuse detected' } });
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const tokens = await issueTokenPair(user, familyId, replacementTokenId);
  await recordAuditEvent({ actorUserId: user._id.toString(), actorRole: user.role, action: 'AUTH_REFRESH', targetType: 'User', targetId: user._id.toString(), outcome: 'SUCCESS' });
  return { user, tokens };
}

export async function logoutUser(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;

  const tokenHash = sha256(rawRefreshToken);
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    if (payload.familyId) {
      await RefreshTokenModel.updateMany({ familyId: payload.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
      return;
    }
  } catch {
    // Fall back to hash revocation for malformed/legacy tokens.
  }
  await RefreshTokenModel.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAuditEvent({ action: 'AUTH_LOGOUT', targetType: 'Session', targetId: tokenHash.slice(0, 16), outcome: 'SUCCESS' });
}

export async function getCurrentUser(userId: string): Promise<UserDocument> {
  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 404);
  }
  return user;
}
