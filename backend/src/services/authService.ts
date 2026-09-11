import { UserModel, UserDocument } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { hashPassword, comparePassword } from '../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sha256 } from '../utils/hash';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import ms from 'ms';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
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

  return user;
}

async function issueTokenPair(user: UserDocument): Promise<TokenPair> {
  const accessToken = signAccessToken(user._id.toString(), user.role);
  const refreshToken = signRefreshToken(user._id.toString());

  const refreshTokenExpiresAt = new Date(Date.now() + ms(env.jwt.refreshExpiresIn as ms.StringValue));

  await RefreshTokenModel.create({
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
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('This account has been deactivated. Contact your administrator.', 403);
  }

  const passwordMatches = await comparePassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError('Invalid email or password', 401);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user);
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
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    userId = payload.sub;
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const tokenHash = sha256(rawRefreshToken);
  const storedToken = await RefreshTokenModel.findOne({ tokenHash, userId });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt.getTime() < Date.now()) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  storedToken.revokedAt = new Date();
  await storedToken.save();

  const tokens = await issueTokenPair(user);
  return { user, tokens };
}

export async function logoutUser(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;

  const tokenHash = sha256(rawRefreshToken);
  await RefreshTokenModel.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getCurrentUser(userId: string): Promise<UserDocument> {
  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('User not found or inactive', 404);
  }
  return user;
}
