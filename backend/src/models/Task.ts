import { Schema, model, Document, Types } from 'mongoose';
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES, TaskPriority, TaskStatus } from '../config/constants';

export interface TaskDocument extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  projectId: Types.ObjectId;
  assignedTo: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },
    // Tasks only reference projects/employees by id — nothing from either
    // is duplicated here; names etc. are populated on read.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    priority: { type: String, enum: TASK_PRIORITY_VALUES, required: true, default: 'MEDIUM' },
    status: { type: String, enum: TASK_STATUS_VALUES, required: true, default: 'TODO' },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Single-field indexes: each backs one of the list filters on its own.
taskSchema.index({ projectId: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ dueDate: 1 });

// Compound indexes, each justified by a specific hot query:
// - "this person's tasks by status" (an employee's workboard)
taskSchema.index({ assignedTo: 1, status: 1 });
// - "this project's tasks by status" (project board / progress)
taskSchema.index({ projectId: 1, status: 1 });
// - overdue scans: open tasks ordered by due date (reminder/escalation jobs, overdue filter)
taskSchema.index({ status: 1, dueDate: 1 });

export const TaskModel = model<TaskDocument>('Task', taskSchema);
