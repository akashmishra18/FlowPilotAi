import { Request, Response } from 'express';
import { requireRole } from '../../src/middleware/rbac';
import { AppError } from '../../src/utils/AppError';

function mockReq(user?: { id: string; role: string }): Request {
  return { user } as unknown as Request;
}

describe('requireRole middleware', () => {
  it('calls next() when the user has an allowed role', () => {
    const req = mockReq({ id: 'u1', role: 'ADMIN' });
    const next = jest.fn();

    requireRole('ADMIN', 'MANAGER')(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws a 403 AppError when the user role is not allowed', () => {
    const req = mockReq({ id: 'u1', role: 'EMPLOYEE' });
    const next = jest.fn();

    expect(() => requireRole('ADMIN', 'MANAGER')(req, {} as Response, next)).toThrow(AppError);

    try {
      requireRole('ADMIN', 'MANAGER')(req, {} as Response, next);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(403);
    }

    expect(next).not.toHaveBeenCalled();
  });

  it('throws a 401 AppError when no user is attached (auth middleware did not run)', () => {
    const req = mockReq(undefined);
    const next = jest.fn();

    expect(() => requireRole('ADMIN')(req, {} as Response, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows any of multiple permitted roles, e.g. requireRole(ADMIN, MANAGER, TEAM_LEAD)', () => {
    const req = mockReq({ id: 'u1', role: 'TEAM_LEAD' });
    const next = jest.fn();

    requireRole('ADMIN', 'MANAGER', 'TEAM_LEAD')(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
