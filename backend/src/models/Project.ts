import { Schema, model, Document, Types } from 'mongoose';
import { PROJECT_STATUS_VALUES, ProjectStatus } from '../config/constants';

export interface ProjectDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  projectCode: string;
  status: ProjectStatus;
  clientName: string;
  startDate: Date;
  deadline: Date | null;
  createdBy: Types.ObjectId;
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
    projectCode: {
      type: String,
      required: true,
      unique: true, // looked up directly (e.g. "FP-GAME-01") in reports and tickets
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUS_VALUES,
      required: true,
      default: 'PLANNING',
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
    deadline: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const ProjectModel = model<ProjectDocument>('Project', projectSchema);
