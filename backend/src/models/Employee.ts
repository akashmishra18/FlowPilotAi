import { Schema, model, Document, Types } from 'mongoose';

export interface EmployeeDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeId: string;
  department: string;
  designation: string;
  phone: string | null;
  skills: string[];
  joinedAt: Date;
  managerId: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const employeeSchema = new Schema<EmployeeDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one employee record per user account
    },
    employeeId: {
      type: String,
      required: true,
      unique: true, // human-facing ID (e.g. "FP-0042"), looked up directly
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    joinedAt: {
      type: Date,
      required: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Supports the /api/employees list filters (department, isActive) without
// a full collection scan once employee counts grow.
employeeSchema.index({ department: 1 });
employeeSchema.index({ isActive: 1 });

export const EmployeeModel = model<EmployeeDocument>('Employee', employeeSchema);
