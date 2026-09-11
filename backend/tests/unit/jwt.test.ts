import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/utils/jwt';

describe('JWT access tokens', () => {
  it('signs a token that verifies back to the same user id and role', () => {
    const token = signAccessToken('user-123', 'MANAGER');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.role).toBe('MANAGER');
    expect(payload.type).toBe('access');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('user-123', 'EMPLOYEE');
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a refresh token presented as an access token', () => {
    const refreshToken = signRefreshToken('user-123');
    // Signed with a different secret, so this should already fail verification.
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      { sub: 'user-123', role: 'EMPLOYEE', type: 'access' },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 },
    );
    expect(() => verifyAccessToken(expired)).toThrow();
  });

  it('does not embed sensitive fields like password or email', () => {
    const token = signAccessToken('user-123', 'ADMIN');
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded).not.toHaveProperty('password');
    expect(decoded).not.toHaveProperty('email');
    expect(decoded).not.toHaveProperty('passwordHash');
  });
});

describe('JWT refresh tokens', () => {
  it('signs a refresh token that verifies back to the same user id', () => {
    const token = signRefreshToken('user-456');
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-456');
    expect(payload.type).toBe('refresh');
  });

  it('rejects an access token presented as a refresh token', () => {
    const accessToken = signAccessToken('user-456', 'EMPLOYEE');
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});
