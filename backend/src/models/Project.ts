import { Schema, model, Document, Types } from 'mongoose';
import { PROJECT_STATUS_VALUES, ProjectStatus, PROJECT_PRIORITY_VALUES, ProjectPriority } from '../config/constants';

export interface ProjectDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  projectCode: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  clientName: string;
  startDate: Date;
  deadline: Date | null;
  managerId: Types.ObjectId;
  members: Types.ObjectId[];
  isActive: boolean;
  createdBy: Types.ObjectId;
  demoSeedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<ProjectDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    // Serves the "projectId" requirement from the Phase 3.2A spec — kept
    // under its existing Phase 2 name (projectCode) rather than renamed,
    // since it's already a unique, human-facing identifier (e.g. "FP-01").
    projectCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUS_VALUES,
      required: true,
      default: 'PLANNING',
    },
    priority: {
      type: String,
      enum: PROJECT_PRIORITY_VALUES,
      required: true,
      default: 'MEDIUM',
    },
    clientName: {
      type: String,
      default: '',
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    // Serves the "endDate" requirement — kept under its existing Phase 2
    // name (deadline) rather than renamed.
    deadline: {
      type: Date,
      default: null,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // "projects this manager manages" is a core RBAC-scoped query
    },
    members: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
      default: [],
      index: true, // "projects this employee is a member of" is a core RBAC-scoped query
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    demoSeedKey: { type: String, select: false },
  },
  {
    timestamps: true,
  },
);

projectSchema.index({ demoSeedKey: 1 }, { unique: true, sparse: true });

projectSchema.index({ status: 1 });
projectSchema.index({ priority: 1 });
projectSchema.index({ isActive: 1 });

export const ProjectModel = model<ProjectDocument>('Project', projectSchema);
