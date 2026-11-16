jest.mock('../../src/config/env', () => ({ env: { corsOrigin: 'http://localhost:5173', email: { provider: 'resend', apiKey: 'configured-key', fromAddress: 'FlowPilot <team@example.test>' } } }));
jest.mock('../../src/models/Notification', () => ({ NotificationModel: { updateOne: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../src/models/User', () => ({ UserModel: { findById: jest.fn() } }));
jest.mock('../../src/integrations/email/resendEmailProvider', () => ({ sendResendEmail: jest.fn() }));

import { env } from '../../src/config/env';
import { NotificationModel } from '../../src/models/Notification';
import { UserModel } from '../../src/models/User';
import { sendResendEmail } from '../../src/integrations/email/resendEmailProvider';
import { persistNotification } from '../../src/services/messagingService';
import { Types } from 'mongoose';

const userId = new Types.ObjectId().toString();
const notification = { userId, type: 'NEW_MESSAGE' as const, title: 'New message', body: 'A colleague sent a message.', href: '/messages/abc', dedupeKey: 'message:abc' };
const rows = NotificationModel as unknown as { updateOne: jest.Mock; findOne: jest.Mock };
const users = UserModel as unknown as { findById: jest.Mock };
const send = sendResendEmail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  rows.updateOne.mockResolvedValue({ upsertedCount: 1 });
  rows.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ emailStatus: 'PENDING' }) });
  users.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ email: 'person@example.test', isActive: true }) }) });
});

it('keeps the in-app notification and records Resend acceptance as SENT', async () => {
  send.mockResolvedValue('SENT');
  await expect(persistNotification({ ...notification, userId })).resolves.toEqual({ inAppStatus: 'DELIVERED', emailStatus: 'SENT' });
  expect(rows.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId }), expect.objectContaining({ $setOnInsert: expect.objectContaining({ inAppStatus: 'DELIVERED', emailStatus: 'PENDING' }) }), { upsert: true });
  expect(rows.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({ userId }), { $set: { emailStatus: 'SENT' } });
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'person@example.test', subject: notification.title, text: notification.body, idempotencyKey: expect.stringContaining(notification.dedupeKey) }));
});

it('preserves in-app delivery and stores FAILED when Resend fails', async () => {
  send.mockResolvedValue('FAILED');
  await expect(persistNotification({ ...notification, userId })).resolves.toEqual({ inAppStatus: 'DELIVERED', emailStatus: 'FAILED' });
  expect(rows.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId }), { $set: { emailStatus: 'FAILED' } });
});

it('stores NOT_CONFIGURED and skips sending when Resend credentials are absent', async () => {
  const email = env.email as { provider: string; apiKey: string; fromAddress: string };
  email.apiKey = '';
  await expect(persistNotification({ ...notification, userId })).resolves.toEqual({ inAppStatus: 'DELIVERED', emailStatus: 'NOT_CONFIGURED' });
  expect(rows.updateOne).toHaveBeenCalledTimes(2); // in-app insert plus explicit status
  expect(send).not.toHaveBeenCalled();
  email.apiKey = 'configured-key';
});

it('does not misreport a notification database failure as missing email configuration', async () => {
  rows.updateOne.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(persistNotification({ ...notification, userId })).resolves.toEqual({ inAppStatus: 'FAILED', emailStatus: 'FAILED' });
  expect(send).not.toHaveBeenCalled();
});
