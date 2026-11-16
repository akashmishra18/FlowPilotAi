/**
 * Maintained standard-processing token rates in USD per 1M tokens.
 * Source: https://developers.openai.com/api/docs/models/gpt-6-luna
 * Reviewed 2026-11-13. Only exact model IDs are priced; unknown models remain
 * cost-unavailable. Update this table when provider rates or processing tier changes.
 */
export const AI_MODEL_PRICING_VERSION = 'openai-standard-2026-11-13';
export const GEMINI_FREE_PRICING_VERSION = 'gemini-free-tier-2026-11-13';

/** Source: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-11-13).
 * Gemini free-tier rates are applied only when explicitly opted into by config.
 */
export const GEMINI_FREE_TIER_MODELS: Readonly<Record<string, true>> = {
  'gemini-3.8-flash': true,
};

export interface ModelTokenPricing {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const AI_MODEL_PRICING: Readonly<Record<string, ModelTokenPricing>> = {
  'gpt-6-luna': {
    inputUsdPerMillion: 0.1,
    cachedInputUsdPerMillion: 0.01,
    outputUsdPerMillion: 0.5,
  },
};
