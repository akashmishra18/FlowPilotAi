import { Model } from 'mongoose';
import { UserDocument, UserModel } from '../models/User';
import { recordAuditEvent } from './auditService';

interface AdminAccountModel {
  findById(id: string): Promise<{ _id: { toString(): string }; role: string; isActive: boolean; email: string } | null>;
  findOne(filter: Record<string, unknown>): Promise<{ _id: { toString(): string } } | null>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number }>;
}

function normalizeGmailAddress(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/.test(email)) throw new Error('Enter a valid Gmail address.');
  return email;
}

export async function updateExistingAdminEmail(
  userId: string,
  requestedEmail: string,
  model: AdminAccountModel = UserModel as unknown as Model<UserDocument> & AdminAccountModel,
): Promise<void> {
  const email = normalizeGmailAddress(requestedEmail);
  const admin = await model.findById(userId);
  if (!admin) throw new Error('Admin account was not found. No changes made.');
  if (admin.role !== 'ADMIN') throw new Error('The specified account is not an ADMIN. No changes made.');
  if (!admin.isActive) throw new Error('The specified Admin account is inactive. No changes made.');
  if (admin.email.toLowerCase() === email) return;

  const duplicate = await model.findOne({ email, _id: { $ne: userId } });
  if (duplicate) throw new Error('That Gmail address is already assigned to another account. No changes made.');

  try {
    const result = await model.updateOne({ _id: userId, role: 'ADMIN', isActive: true }, { $set: { email } });
    if (result.matchedCount !== 1) throw new Error('Admin account state changed before update. No changes made.');
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new Error('That Gmail address is already assigned to another account. No changes made.');
    throw error;
  }

  await recordAuditEvent({
    actorUserId: userId,
    actorRole: 'ADMIN',
    action: 'ADMIN_LOGIN_EMAIL_UPDATED',
    targetType: 'User',
    targetId: userId,
    outcome: 'SUCCESS',
    before: { emailChanged: true },
    after: { emailChanged: true },
  });
}
