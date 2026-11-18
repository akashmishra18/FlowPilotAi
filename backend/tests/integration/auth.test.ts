import request from 'supertest';
import { createApp } from '../../src/app';
import { AppError } from '../../src/utils/AppError';
import { signAccessToken } from '../../src/utils/jwt';
import * as authService from '../../src/services/authService';
import { UserModel } from '../../src/models/User';
import { getRefreshCookieOptions } from '../../src/controllers/authController';

jest.mock('../../src/services/authService');
jest.mock('../../src/models/User');

const mockedAuthService = authService as jest.Mocked<typeof authService>;
const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;
mockedUserModel.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isActive: true }) } as never);

const app = createApp();

const fakeUser = {
  _id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'EMPLOYEE',
  isActive: true,
};

describe('POST /api/auth/register', () => {
  it('registers a new user and returns 201', async () => {
    mockedAuthService.registerUser.mockResolvedValue(fakeUser as never);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'supersecure1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('ada@example.com');
  });

  it('rejects registration with an invalid email (validation)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'not-an-email', password: 'supersecure1' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(mockedAuthService.registerUser).not.toHaveBeenCalled();
  });

  it('rejects registration with a short password (validation)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: '123' });

    expect(res.status).toBe(422);
  });

  it('returns 409 for a duplicate email', async () => {
    mockedAuthService.registerUser.mockRejectedValue(
      new AppError('An account with this email already exists', 409),
    );

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'supersecure1' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    // Never leak a stack trace or internal error detail to the client.
    expect(res.body.message).toBe('An account with this email already exists');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and sets a refresh-token cookie', async () => {
    mockedAuthService.loginUser.mockResolvedValue({
      user: fakeUser as never,
      tokens: {
        accessToken: 'fake.access.token',
        refreshToken: 'fake.refresh.token',
        refreshTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'supersecure1' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('fake.access.token');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie?.[0]).toMatch(/refreshToken=/);
    expect(setCookie?.[0]).toMatch(/HttpOnly/i);
  });

  it('returns 401 for invalid credentials without revealing which field was wrong', async () => {
    mockedAuthService.loginUser.mockRejectedValue(new AppError('Invalid email or password', 401));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('returns 403 for a deactivated account', async () => {
    mockedAuthService.loginUser.mockRejectedValue(
      new AppError('This account has been deactivated. Contact your administrator.', 403),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@example.com', password: 'supersecure1' });

    expect(res.status).toBe(403);
  });
});

describe('refresh cookie configuration', () => {
  it('uses cross-site secure cookies in production and strict cookies locally', () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    expect(getRefreshCookieOptions(true, expiresAt)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', expires: expiresAt, path: '/api/auth' });
    expect(getRefreshCookieOptions(false, expiresAt)).toMatchObject({ secure: false, sameSite: 'strict' });
  });
});

describe('POST /api/auth/users (admin provisioning)', () => {
  it('allows an ADMIN to provision an explicitly assigned role', async () => {
    mockedAuthService.provisionUser.mockResolvedValue({ ...fakeUser, role: 'MANAGER' } as never);
    const token = signAccessToken('admin-1', 'ADMIN');
    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Manager', email: 'manager@example.com', password: 'supersecure1', role: 'MANAGER' });

    expect(res.status).toBe(201);
    expect(mockedAuthService.provisionUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-1', role: 'ADMIN' }),
      expect.objectContaining({ role: 'MANAGER' }),
    );
  });

  it('rejects non-admin provisioning before calling the service', async () => {
    const token = signAccessToken('manager-1', 'MANAGER');
    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Employee', email: 'employee@example.com', password: 'supersecure1', role: 'EMPLOYEE' });

    expect(res.status).toBe(403);
    expect(mockedAuthService.provisionUser).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/me (protected route)', () => {
  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed/invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid access token', async () => {
    mockedAuthService.getCurrentUser.mockResolvedValue(fakeUser as never);
    const token = signAccessToken('u1', 'EMPLOYEE');

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('ada@example.com');
    expect(mockedAuthService.getCurrentUser).toHaveBeenCalledWith('u1');
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 when no refresh-token cookie is present', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin refresh request before checking the cookie or calling auth service', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Origin', 'https://unexpected.example');
    expect(res.status).toBe(403);
    expect(mockedAuthService.refreshSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the refresh-token cookie and returns success', async () => {
    mockedAuthService.logoutUser.mockResolvedValue(undefined);

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
