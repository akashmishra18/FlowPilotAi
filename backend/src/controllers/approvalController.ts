import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as approvalService from '../services/approvalService';

export const createTaskReassignment = asyncHandler(async (req: Request, res: Response) => {
  const request = await approvalService.createTaskReassignmentRequest(req.user!, req.body.taskId, req.body.assignedTo);
  sendSuccess(res, { request }, 201, 'Task reassignment approval requested');
});

export const listTaskReassignments = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await approvalService.listTaskReassignmentRequests(req.user!));
});

export const approveTaskReassignment = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await approvalService.approveTaskReassignment(req.user!, req.params.id), 200, 'Task reassignment approved and executed');
});

export const rejectTaskReassignment = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await approvalService.rejectTaskReassignment(req.user!, req.params.id), 200, 'Task reassignment rejected');
});
