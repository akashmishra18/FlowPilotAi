import { Schema, model, Document, Types } from 'mongoose';
import { ROLE_VALUES, Role } from '../config/constants';

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  demoSeedKey?: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true, // also creates the index we need for fast login lookups
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned unless explicitly requested with +passwordHash
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      required: true,
      default: 'EMPLOYEE',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Hidden from normal API projections; used only by the guarded local demo cleanup.
    demoSeedKey: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ demoSeedKey: 1 }, { unique: true, sparse: true });

export const UserModel = model<UserDocument>('User', userSchema);
