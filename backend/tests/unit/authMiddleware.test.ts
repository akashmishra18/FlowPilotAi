import { Types } from 'mongoose';
import { signAccessToken } from '../../src/utils/jwt';

jest.mock('../../src/models/User');
jest.mock('../../src/models/RefreshToken');

import { UserModel } from '../../src/models/User';
import { RefreshTokenModel } from '../../src/models/RefreshToken';
import { authenticate } from '../../src/middleware/auth';

const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;
const mockedRefreshTokenModel = RefreshTokenModel as jest.Mocked<typeof RefreshTokenModel>;

function requestFor(token: string) {
  return { headers: { authorization: `Bearer ${token}` } } as never;
}

describe('session-bound access tokens', () => {
  const userId = new Types.ObjectId().toString();
  const familyId = 'family-1';

  beforeEach(() => {
    mockedUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ role: 'EMPLOYEE', isActive: true }),
    } as never);
  });

  it('allows an active session', async () => {
    mockedRefreshTokenModel.exists.mockResolvedValue({ _id: 'active' } as never);
    const next = jest.fn();
    authenticate(requestFor(signAccessToken(userId, 'EMPLOYEE', familyId)), {} as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects access after the session family is revoked', async () => {
    mockedRefreshTokenModel.exists.mockResolvedValue(null);
    const next = jest.fn();
    authenticate(requestFor(signAccessToken(userId, 'EMPLOYEE', familyId)), {} as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rejects legacy access tokens when the account is now inactive', async () => {
    mockedUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ isActive: false }),
    } as never);
    const next = jest.fn();
    authenticate(requestFor(signAccessToken(userId, 'EMPLOYEE')), {} as never, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
