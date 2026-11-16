import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as taskService from '../services/taskService';
import { TaskPriority, TaskStatus } from '../config/constants';
import { randomUUID } from 'crypto';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, projectId, assignedTo, priority, status, dueDate, tags } = req.body;
  const task = await taskService.createTask(req.user!, {
    title,
    description,
    projectId,
    assignedTo,
    priority,
    status,
    dueDate,
    tags,
  });
  sendSuccess(res, { task }, 201, 'Task created successfully');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, projectId, assignedTo, status, priority, dueDateFrom, dueDateTo, overdue, search } =
    req.query;

  const result = await taskService.listTasks(req.user!, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    projectId: projectId as string | undefined,
    assignedTo: assignedTo as string | undefined,
    status: status as TaskStatus | undefined,
    priority: priority as TaskPriority | undefined,
    dueDateFrom: dueDateFrom as string | undefined,
    dueDateTo: dueDateTo as string | undefined,
    overdue: overdue === undefined ? undefined : overdue === 'true',
    search: search as string | undefined,
  });

  sendSuccess(res, result);
});

export const overdueAssistant = asyncHandler(async (req: Request, res: Response) => {
  // This endpoint is a live, role-scoped result. Avoid browser/proxy cache hits
  // and conditional GETs returning an old AI summary as HTTP 304.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  const suppliedRequestId = req.get('x-request-id');
  const requestId = suppliedRequestId && /^[A-Za-z0-9._-]{1,100}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const result = await taskService.getOverdueTaskAssistant(req.user!, requestId);
  sendSuccess(res, result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const task = await taskService.getTaskById(req.user!, req.params.id);
  sendSuccess(res, { task });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  // Explicit pick: only these keys can ever reach the service from the body.
  const { title, description, assignedTo, priority, status, dueDate, tags } = req.body;
  const task = await taskService.updateTask(req.user!, req.params.id, {
    title,
    description,
    assignedTo,
    priority,
    status,
    dueDate,
    tags,
  });
  sendSuccess(res, { task }, 200, 'Task updated successfully');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await taskService.deleteTask(req.user!, req.params.id);
  sendSuccess(res, null, 200, 'Task deleted successfully');
});
