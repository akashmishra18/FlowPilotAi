import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { signRefreshToken } from '../../src/utils/jwt';
import { sha256 } from '../../src/utils/hash';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/User');
jest.mock('../../src/models/RefreshToken');
jest.mock('../../src/services/auditService');

import { UserModel } from '../../src/models/User';
import { RefreshTokenModel } from '../../src/models/RefreshToken';
import { refreshSession, logoutUser } from '../../src/services/authService';

const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;
const mockedRefreshTokenModel = RefreshTokenModel as jest.Mocked<typeof RefreshTokenModel>;

const userId = new Types.ObjectId();
const familyId = 'family-1';
const tokenId = 'token-1';
const user = { _id: userId, role: 'EMPLOYEE', isActive: true } as never;

function token() {
  return signRefreshToken(userId.toString(), tokenId, familyId);
}

describe('refresh-token session integrity', () => {
  beforeEach(() => {
    mockedUserModel.findById.mockResolvedValue(user);
    mockedRefreshTokenModel.create.mockResolvedValue({} as never);
  });

  it('atomically allows only one concurrent consumer of a refresh token', async () => {
    const raw = token();
    const stored = {
      _id: new Types.ObjectId(),
      tokenId,
      familyId,
      tokenHash: sha256(raw),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockedRefreshTokenModel.findOne.mockResolvedValue(stored as never);
    mockedRefreshTokenModel.findOneAndUpdate
      .mockResolvedValueOnce(stored as never)
      .mockResolvedValueOnce(null as never);

    const results = await Promise.allSettled([refreshSession(raw), refreshSession(raw)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(mockedRefreshTokenModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockedRefreshTokenModel.updateMany).toHaveBeenCalledWith(
      { familyId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const raw = token();
    mockedRefreshTokenModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(),
      tokenId,
      familyId,
      tokenHash: sha256(raw),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    await expect(refreshSession(raw)).rejects.toMatchObject({ statusCode: 401 } as Partial<AppError>);
    expect(mockedRefreshTokenModel.updateMany).toHaveBeenCalledWith(
      { familyId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it('revokes every token in a session family on logout', async () => {
    await logoutUser(token());
    expect(mockedRefreshTokenModel.updateMany).toHaveBeenCalledWith(
      { familyId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it('rejects an expired refresh token before touching the session store', async () => {
    const expired = jwt.sign(
      { sub: userId.toString(), type: 'refresh', jti: tokenId, familyId },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: -10 },
    );
    await expect(refreshSession(expired)).rejects.toMatchObject({ statusCode: 401 } as Partial<AppError>);
    expect(mockedRefreshTokenModel.findOne).not.toHaveBeenCalled();
  });

  it('rejects refresh for an inactive account', async () => {
    const raw = token();
    mockedRefreshTokenModel.findOne.mockResolvedValue({
      _id: new Types.ObjectId(), tokenId, familyId, tokenHash: sha256(raw), revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockedUserModel.findById.mockResolvedValue({ _id: userId, role: 'EMPLOYEE', isActive: false } as never);

    await expect(refreshSession(raw)).rejects.toMatchObject({ statusCode: 401 } as Partial<AppError>);
    expect(mockedRefreshTokenModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
