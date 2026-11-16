import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as service from '../services/clientIssueService';

export const list = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await service.listClientIssues(req.user!, req.query.status as never)));
export const create = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await service.createClientIssue(req.user!, req.body), 201));
export const update = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await service.updateClientIssue(req.user!, req.params.id, req.body)));
