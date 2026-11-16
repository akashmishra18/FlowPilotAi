import { model, Schema, Types } from 'mongoose';

export interface MessageDocument {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  body: string;
  relatedTaskId: Types.ObjectId | null;
  kind: 'USER' | 'OVERDUE_REMINDER';
  idempotencyKey: string | null;
  createdAt: Date;
  readAt: Date | null;
}

const schema = new Schema<MessageDocument>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  relatedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  kind: { type: String, enum: ['USER', 'OVERDUE_REMINDER'], default: 'USER' },
  idempotencyKey: { type: String, default: undefined },
  createdAt: { type: Date, default: Date.now, immutable: true },
  readAt: { type: Date, default: null },
}, { versionKey: false });
schema.index({ conversationId: 1, createdAt: 1 });
schema.index({ recipientId: 1, readAt: 1 });
schema.index({ senderId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const MessageModel = model<MessageDocument>('Message', schema);
