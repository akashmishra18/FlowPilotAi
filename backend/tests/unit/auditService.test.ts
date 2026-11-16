import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/AuditEvent');

import { AuditEventModel } from '../../src/models/AuditEvent';
import { listAuditEvents, recordAuditEvent } from '../../src/services/auditService';

const mockedAuditEvent = AuditEventModel as jest.Mocked<typeof AuditEventModel>;

describe('auditService', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates an immutable event with actor and target association', async () => {
    mockedAuditEvent.create.mockResolvedValue({} as never);
    const actorId = new Types.ObjectId().toString();
    await recordAuditEvent({ actorUserId: actorId, actorRole: 'ADMIN', action: 'USER_PROVISIONED', targetType: 'User', targetId: 'target-1', outcome: 'SUCCESS', before: { role: 'EMPLOYEE' }, after: { role: 'MANAGER' } });
    expect(mockedAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: actorId, actorRole: 'ADMIN', targetType: 'User', targetId: 'target-1', outcome: 'SUCCESS' }));
  });

  it('strips secrets from metadata and error details are bounded', async () => {
    mockedAuditEvent.create.mockResolvedValue({} as never);
    await recordAuditEvent({ action: 'AUTH_LOGIN', targetType: 'User', targetId: 'u1', outcome: 'FAILURE', before: { password: 'secret', nested: { refreshToken: 'token', safe: true } }, error: { message: 'x'.repeat(1000) } });
    const document = mockedAuditEvent.create.mock.calls[0][0] as Record<string, unknown>;
    expect(document.before).toEqual({ nested: { safe: true } });
    expect((document.error as { message: string }).message).toHaveLength(500);
  });

  it('requires ADMIN access to list audit events', async () => {
    await expect(listAuditEvents({ id: new Types.ObjectId().toString(), role: 'MANAGER' })).rejects.toMatchObject({ statusCode: 403 } as Partial<AppError>);
  });

  it('lists events with pagination for ADMIN callers', async () => {
    const chain = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ action: 'X' }]) };
    mockedAuditEvent.find.mockReturnValue(chain as never);
    mockedAuditEvent.countDocuments.mockResolvedValue(1 as never);
    const result = await listAuditEvents({ id: new Types.ObjectId().toString(), role: 'ADMIN' }, { page: 2, limit: 10 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });
});
