import { Request, Response } from 'express';
import { overdueAssistant } from '../../src/controllers/taskController';
import * as taskService from '../../src/services/taskService';

jest.mock('../../src/services/taskService');

const mockedService = taskService as jest.Mocked<typeof taskService>;

it('disables conditional caching for the overdue assistant response', async () => {
  mockedService.getOverdueTaskAssistant.mockResolvedValue({
    summary: 'Fresh rule-based summary for overdue work.',
    summarySource: 'RULE_BASED',
    fallbackReason: null,
    tasks: [],
    total: 0,
  });
  const req = {
    get: jest.fn().mockReturnValue(null),
    headers: { 'if-none-match': '"stale-summary"', 'if-modified-since': new Date().toUTCString() },
    user: { id: '507f1f77bcf86cd799439011', role: 'ADMIN' },
  } as unknown as Request;
  let resolveResponse!: (body: unknown) => void;
  const responseSent = new Promise<unknown>((resolve) => { resolveResponse = resolve; });
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn((body: unknown) => { resolveResponse(body); return undefined; }),
  } as unknown as Response;

  overdueAssistant(req, response, jest.fn());
  await responseSent;

  expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  expect(req.headers['if-none-match']).toBeUndefined();
  expect(req.headers['if-modified-since']).toBeUndefined();
});
