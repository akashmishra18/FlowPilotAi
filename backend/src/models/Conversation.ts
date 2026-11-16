import { model, Schema, Types } from 'mongoose';

export interface ConversationDocument {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  participantKey: string;
  relatedTaskIds: Types.ObjectId[];
  latestMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ConversationDocument>({
  participants: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true, validate: (v: Types.ObjectId[]) => v.length === 2 },
  participantKey: { type: String, required: true, unique: true },
  relatedTaskIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Task' }], default: [] },
  latestMessageAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ participants: 1, latestMessageAt: -1 });

export const ConversationModel = model<ConversationDocument>('Conversation', schema);
