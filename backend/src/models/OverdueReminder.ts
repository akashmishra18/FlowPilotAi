import { model, Schema, Types } from 'mongoose';

export interface OverdueReminderDocument {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  dedupeKey: string;
  conversationId: Types.ObjectId | null;
  messageId: Types.ObjectId | null;
  recipientStatuses: Array<{ userId: Types.ObjectId; inAppStatus: string; emailStatus: string }>;
  createdAt: Date;
}

const schema = new Schema<OverdueReminderDocument>({
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  dedupeKey: { type: String, required: true, unique: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
  messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
  recipientStatuses: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inAppStatus: { type: String, enum: ['PENDING', 'DELIVERED', 'FAILED'], required: true },
    emailStatus: { type: String, enum: ['NOT_CONFIGURED', 'PENDING', 'SENT', 'FAILED'], required: true },
  }],
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });

export const OverdueReminderModel = model<OverdueReminderDocument>('OverdueReminder', schema);
