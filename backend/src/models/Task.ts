import { Schema, model, Document, Types } from 'mongoose';
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES, TaskPriority, TaskStatus } from '../config/constants';

export interface TaskDocument extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  projectId: Types.ObjectId;
  assignedTo: Types.ObjectId | null;
  assignedBy: Types.ObjectId;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<TaskDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true, // "all tasks for this project" is a core dashboard query
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true, // "my tasks" is one of the most frequent queries in the app
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITY_VALUES,
      required: true,
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: TASK_STATUS_VALUES,
      required: true,
      default: 'TODO',
      index: true, // dashboard widgets filter/count by status constantly
    },
    dueDate: {
      type: Date,
      default: null,
      index: true, // overdue-task and reminder/escalation jobs scan by dueDate
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index: the single most common query pattern once tasks exist —
// "this person's tasks by status" (e.g. an employee's pending tasks).
taskSchema.index({ assignedTo: 1, status: 1 });

export const TaskModel = model<TaskDocument>('Task', taskSchema);
