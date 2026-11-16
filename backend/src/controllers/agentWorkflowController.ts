import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { listAgentWorkflows, submitAgentWorkflow } from '../services/agentWorkflowService';
import { AppError } from '../utils/AppError';
import { randomUUID } from 'crypto';

function requestCorrelationId(req: Request, res: Response): string {
  const supplied = req.get('x-request-id');
  const id = supplied && /^[a-zA-Z0-9._:-]{1,80}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

export const submit = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await submitAgentWorkflow(req.user!, req.body.request, undefined, requestCorrelationId(req, res)), 201));
export const list = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await listAgentWorkflows(req.user!)));

export const stream = asyncHandler(async (req: Request, res: Response) => {
  const requestId = requestCorrelationId(req, res);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  try {
    const result = await submitAgentWorkflow(req.user!, req.body.request, (progress) => send(progress.type, progress), requestId);
    send('workflow', result.workflow);
  } catch (error) {
    send('error', { message: error instanceof AppError ? error.message : 'The workflow could not be completed. Please try again.' });
  } finally {
    res.end();
  }
});
