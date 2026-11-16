jest.mock('../../src/models/User', () => ({ UserModel: {} }));
jest.mock('../../src/services/auditService', () => ({ recordAuditEvent: jest.fn().mockResolvedValue(undefined) }));

import { updateExistingAdminEmail } from '../../src/services/adminEmailUpdateService';
import { recordAuditEvent } from '../../src/services/auditService';

const userId = '64b000000000000000000001';
function stub(overrides: { user?: unknown; duplicate?: unknown } = {}) {
  return {
    findById: jest.fn().mockResolvedValue(overrides.user === undefined ? { _id: { toString: () => userId }, role: 'ADMIN', isActive: true, email: 'demo.admin@flowpilot.local' } : overrides.user),
    findOne: jest.fn().mockResolvedValue(overrides.duplicate ?? null),
    updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
  };
}

beforeEach(() => jest.clearAllMocks());

it('updates the existing active Admin in place and audits only that the email changed', async () => {
  const model = stub();
  await updateExistingAdminEmail(userId, '  Alex.Example@GMAIL.COM ', model as never);
  expect(model.findById).toHaveBeenCalledWith(userId);
  expect(model.findOne).toHaveBeenCalledWith({ email: 'alex.example@gmail.com', _id: { $ne: userId } });
  expect(model.updateOne).toHaveBeenCalledWith({ _id: userId, role: 'ADMIN', isActive: true }, { $set: { email: 'alex.example@gmail.com' } });
  expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_LOGIN_EMAIL_UPDATED', actorUserId: userId, targetId: userId, before: { emailChanged: true }, after: { emailChanged: true } }));
  expect(JSON.stringify((recordAuditEvent as jest.Mock).mock.calls[0])).not.toContain('alex.example@gmail.com');
});

it('rejects an email already assigned to another account', async () => {
  const model = stub({ duplicate: { _id: { toString: () => 'other' } } });
  await expect(updateExistingAdminEmail(userId, 'taken@gmail.com', model as never)).rejects.toThrow(/already assigned/);
  expect(model.updateOne).not.toHaveBeenCalled();
});

it('rejects an account with the wrong role', async () => {
  const model = stub({ user: { _id: { toString: () => userId }, role: 'MANAGER', isActive: true, email: 'manager@example.test' } });
  await expect(updateExistingAdminEmail(userId, 'new@gmail.com', model as never)).rejects.toThrow(/not an ADMIN/);
  expect(model.updateOne).not.toHaveBeenCalled();
});

it('rejects an inactive Admin', async () => {
  const model = stub({ user: { _id: { toString: () => userId }, role: 'ADMIN', isActive: false, email: 'admin@example.test' } });
  await expect(updateExistingAdminEmail(userId, 'new@gmail.com', model as never)).rejects.toThrow(/inactive/);
  expect(model.updateOne).not.toHaveBeenCalled();
});

it('rejects a missing account', async () => {
  const model = stub({ user: null });
  await expect(updateExistingAdminEmail(userId, 'new@gmail.com', model as never)).rejects.toThrow(/not found/);
  expect(model.updateOne).not.toHaveBeenCalled();
});
