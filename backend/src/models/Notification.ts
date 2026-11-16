import { model, Schema, Types } from 'mongoose';

export interface NotificationDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: 'NEW_MESSAGE' | 'OVERDUE_REMINDER' | 'SCHEDULED_SUMMARY' | 'APPROVAL_UPDATE';
  title: string;
  body: string;
  href: string;
  conversationId: Types.ObjectId | null;
  taskId: Types.ObjectId | null;
  messageId: Types.ObjectId | null;
  dedupeKey: string;
  inAppStatus: 'DELIVERED';
  emailStatus: 'NOT_CONFIGURED' | 'PENDING' | 'SENT' | 'FAILED';
  readAt: Date | null;
  createdAt: Date;
}

const schema = new Schema<NotificationDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['NEW_MESSAGE', 'OVERDUE_REMINDER', 'SCHEDULED_SUMMARY', 'APPROVAL_UPDATE'], required: true },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 300 },
  href: { type: String, required: true, maxlength: 300 },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
  dedupeKey: { type: String, required: true },
  inAppStatus: { type: String, enum: ['DELIVERED'], default: 'DELIVERED' },
  emailStatus: { type: String, enum: ['NOT_CONFIGURED', 'PENDING', 'SENT', 'FAILED'], default: 'NOT_CONFIGURED' },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, readAt: 1 });
schema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export const NotificationModel = model<NotificationDocument>('Notification', schema);
