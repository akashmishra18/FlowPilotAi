import { apiClient } from '@/services/apiClient';

export type AIUsagePeriod = 'daily' | 'weekly' | 'monthly';
export interface AIUsageMetrics {
  requestCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}
export interface AIUsageAnalytics {
  period: AIUsagePeriod;
  window: { start: string; end: string; timezone: 'UTC' };
  summary: AIUsageMetrics;
  trend: Array<AIUsageMetrics & { date: string }>;
  providerModels: Array<AIUsageMetrics & { provider: string; model: string }>;
  users: Array<AIUsageMetrics & { userId: string; name: string; role: string }>;
}

export async function getAIUsageAnalytics(period: AIUsagePeriod): Promise<AIUsageAnalytics> {
  const response = await apiClient.get('/ai-usage', { params: { period } });
  return response.data.data as AIUsageAnalytics;
}
