import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as auditService from '../services/auditService';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await auditService.listAuditEvents(req.user!, {
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  sendSuccess(res, result);
});
