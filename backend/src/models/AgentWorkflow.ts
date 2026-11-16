import { model, Schema, Types } from 'mongoose';

export interface AgentWorkflowDocument {
  _id: Types.ObjectId; userId: Types.ObjectId; request: string; tool: string; risk: 'LOW' | 'MEDIUM' | 'HIGH'; rationale: string;
  status: 'COMPLETED' | 'AWAITING_APPROVAL' | 'REJECTED'; arguments: Record<string, unknown>;
  result: Record<string, unknown> | null; approvalId: Types.ObjectId | null; createdAt: Date;
}
const schema = new Schema<AgentWorkflowDocument>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  request: { type: String, required: true, maxlength: 1000 },
  tool: { type: String, enum: ['list_overdue_tasks', 'request_task_reassignment', 'company_intelligence'], required: true },
  risk: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
  rationale: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['COMPLETED', 'AWAITING_APPROVAL', 'REJECTED'], required: true },
  arguments: { type: Schema.Types.Mixed, required: true },
  result: { type: Schema.Types.Mixed, default: null },
  approvalId: { type: Schema.Types.ObjectId, ref: 'TaskReassignmentApproval', default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { versionKey: false });
schema.index({ userId: 1, createdAt: -1 });
export const AgentWorkflowModel = model<AgentWorkflowDocument>('AgentWorkflow', schema);
