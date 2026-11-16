import { model, Schema, Types } from 'mongoose';

export interface AIUsageEventDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: string;
  modelName: string;
  providerRequestId: string | null;
  /** Provider request ID where present; otherwise the server request correlation ID. */
  dedupeKey: string;
  requestId: string;
  recordedAt: Date;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
  estimatedCostUsd: number | null;
  pricingVersion: string | null;
  pricingTier: string | null;
  inputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
}

const schema = new Schema<AIUsageEventDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, required: true, trim: true },
    modelName: { type: String, required: true, trim: true },
    providerRequestId: { type: String, default: null },
    dedupeKey: { type: String, required: true },
    requestId: { type: String, required: true, trim: true },
    recordedAt: { type: Date, required: true, default: Date.now, immutable: true },
    promptTokens: { type: Number, default: null, min: 0 },
    completionTokens: { type: Number, default: null, min: 0 },
    totalTokens: { type: Number, default: null, min: 0 },
    cachedPromptTokens: { type: Number, default: null, min: 0 },
    estimatedCostUsd: { type: Number, default: null, min: 0 },
    pricingVersion: { type: String, default: null },
    pricingTier: { type: String, default: null },
    inputUsdPerMillion: { type: Number, default: null, min: 0 },
    cachedInputUsdPerMillion: { type: Number, default: null, min: 0 },
    outputUsdPerMillion: { type: Number, default: null, min: 0 },
  },
  { versionKey: false, timestamps: false },
);

schema.index({ provider: 1, dedupeKey: 1 }, { unique: true });
schema.index({ userId: 1, recordedAt: -1 });
schema.index({ provider: 1, modelName: 1, recordedAt: -1 });
schema.index({ recordedAt: -1 });

export const AIUsageEventModel = model<AIUsageEventDocument>('AIUsageEvent', schema);
