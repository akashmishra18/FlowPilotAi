import { Schema, model, Document, Types } from 'mongoose';
import { ROLE_VALUES, Role } from '../config/constants';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

export interface AuditEventDocument extends Document {
  _id: Types.ObjectId;
  actorUserId: Types.ObjectId | null;
  actorRole: Role | null;
  action: string;
  targetType: string;
  targetId: string;
  outcome: AuditOutcome;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string | null;
  error: { code?: string; message: string } | null;
  createdAt: Date;
}

const auditEventSchema = new Schema<AuditEventDocument>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, enum: ROLE_VALUES, default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    targetType: { type: String, required: true, trim: true, index: true },
    targetId: { type: String, required: true, trim: true, index: true },
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], required: true, index: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    requestId: { type: String, default: null, index: true },
    error: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false, timestamps: false },
);

auditEventSchema.index({ actorUserId: 1, createdAt: -1 });
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });

export const AuditEventModel = model<AuditEventDocument>('AuditEvent', auditEventSchema);
