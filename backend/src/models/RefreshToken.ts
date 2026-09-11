import { Schema, model, Document, Types } from 'mongoose';

/**
 * We never store the raw refresh token — only a SHA-256 hash of it — so a
 * database read/leak alone cannot be used to impersonate a session. The
 * raw token only ever lives in the client's httpOnly cookie and briefly
 * in memory server-side while it's being verified/issued.
 */
export interface RefreshTokenDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // supports "revoke all sessions for this user" / lookups on refresh
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index: MongoDB automatically deletes the document once expiresAt
      // has passed, so expired sessions don't accumulate forever.
      index: { expires: 0 },
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export const RefreshTokenModel = model<RefreshTokenDocument>('RefreshToken', refreshTokenSchema);
