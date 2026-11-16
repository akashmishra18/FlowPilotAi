import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getAIUsageAnalytics, AIUsagePeriod } from '../services/aiUsageService';

export const analytics = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAIUsageAnalytics(req.user!, (req.query.period as AIUsagePeriod | undefined) ?? 'daily');
  sendSuccess(res, result);
});
