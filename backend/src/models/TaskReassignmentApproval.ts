import { Document, model, Schema, Types } from 'mongoose';
import { ROLE_VALUES, Role } from '../config/constants';

export type TaskReassignmentApprovalStatus = 'PENDING' | 'EXECUTING' | 'APPROVED' | 'REJECTED' | 'FAILED';

export interface TaskReassignmentApprovalDocument extends Document {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  projectId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  requesterRole: Role;
  fromAssignedTo: Types.ObjectId | null;
  assignedTo: Types.ObjectId;
  status: TaskReassignmentApprovalStatus;
  reviewedBy: Types.ObjectId | null;
  reviewedAt: Date | null;
  executionAttemptId: string | null;
  executionError: string | null;
  demoSeedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<TaskReassignmentApprovalDocument>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requesterRole: { type: String, enum: ROLE_VALUES, required: true },
    fromAssignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    status: { type: String, enum: ['PENDING', 'EXECUTING', 'APPROVED', 'REJECTED', 'FAILED'], default: 'PENDING', required: true, index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    executionAttemptId: { type: String, default: null },
    executionError: { type: String, default: null, maxlength: 300 },
    demoSeedKey: { type: String, select: false },
  },
  { timestamps: true },
);

schema.index({ demoSeedKey: 1 }, { unique: true, sparse: true });

schema.index({ projectId: 1, status: 1, createdAt: -1 });
schema.index({ requestedBy: 1, createdAt: -1 });

export const TaskReassignmentApprovalModel = model<TaskReassignmentApprovalDocument>('TaskReassignmentApproval', schema);
