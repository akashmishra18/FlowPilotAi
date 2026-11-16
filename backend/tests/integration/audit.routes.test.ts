import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import * as auditService from '../../src/services/auditService';
import { UserModel } from '../../src/models/User';

jest.mock('../../src/services/auditService');
jest.mock('../../src/models/User');

const app = createApp();
const mockedAuditService = auditService as jest.Mocked<typeof auditService>;
const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;
mockedUserModel.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isActive: true }) } as never);

describe('GET /api/audit-events', () => {
  it('rejects non-admin roles', async () => {
    const res = await request(app).get('/api/audit-events').set('Authorization', `Bearer ${signAccessToken('manager-1', 'MANAGER')}`);
    expect(res.status).toBe(403);
    expect(mockedAuditService.listAuditEvents).not.toHaveBeenCalled();
  });

  it('allows ADMIN and applies pagination', async () => {
    mockedAuditService.listAuditEvents.mockResolvedValue({ events: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
    const res = await request(app).get('/api/audit-events?page=1&limit=10').set('Authorization', `Bearer ${signAccessToken('admin-1', 'ADMIN')}`);
    expect(res.status).toBe(200);
    expect(mockedAuditService.listAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }), { page: 1, limit: 10 });
  });
});
