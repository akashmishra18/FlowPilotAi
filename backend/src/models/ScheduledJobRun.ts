import { model, Schema, Types } from 'mongoose';

export type ScheduledJobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ScheduledJobRunDocument {
  _id: Types.ObjectId;
  jobKey: string;
  periodKey: string;
  status: ScheduledJobStatus;
  attempts: number;
  startedAt: Date;
  finishedAt: Date | null;
  leaseUntil: Date;
  error: string | null;
  result: Record<string, number> | null;
}

const schema = new Schema<ScheduledJobRunDocument>({
  jobKey: { type: String, required: true },
  periodKey: { type: String, required: true },
  status: { type: String, enum: ['RUNNING', 'SUCCEEDED', 'FAILED'], required: true },
  attempts: { type: Number, required: true, default: 0 },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  leaseUntil: { type: Date, required: true },
  error: { type: String, default: null, maxlength: 300 },
  result: { type: Schema.Types.Mixed, default: null },
}, { versionKey: false });

schema.index({ jobKey: 1, periodKey: 1 }, { unique: true });

export const ScheduledJobRunModel = model<ScheduledJobRunDocument>('ScheduledJobRun', schema);
