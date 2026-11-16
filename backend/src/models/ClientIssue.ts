import { model, Schema, Types } from 'mongoose';

export type ClientIssueStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
export type ClientIssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export interface ClientIssueDocument {
  _id: Types.ObjectId; clientName: string; message: string; priority: ClientIssuePriority; status: ClientIssueStatus;
  receivedAt: Date; createdBy: Types.ObjectId; projectId: Types.ObjectId | null; assignedTo: Types.ObjectId | null; taskId: Types.ObjectId | null;
  createdAt: Date; updatedAt: Date;
}
const schema = new Schema<ClientIssueDocument>({
  clientName: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
  status: { type: String, enum: ['NEW', 'IN_PROGRESS', 'RESOLVED'], default: 'NEW' },
  receivedAt: { type: Date, required: true, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
}, { timestamps: true });
schema.index({ status: 1, priority: 1, receivedAt: -1 });
schema.index({ projectId: 1, assignedTo: 1 });
export const ClientIssueModel = model<ClientIssueDocument>('ClientIssue', schema);
