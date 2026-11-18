jest.mock('../../src/config/env', () => ({ env: { ai: { provider: 'gemini', apiKey: 'test', model: 'test-model', baseUrl: '' } } }));
jest.mock('../../src/models/AgentWorkflow', () => ({ AgentWorkflowModel: { create: jest.fn(), find: jest.fn() } }));
jest.mock('../../src/models/Project', () => ({ ProjectModel: { findById: jest.fn() } }));
jest.mock('../../src/models/Employee', () => ({ EmployeeModel: { find: jest.fn() } }));
jest.mock('../../src/services/taskService', () => ({ listTasks: jest.fn() }));
jest.mock('../../src/services/approvalService', () => ({ createTaskReassignmentRequest: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ recordAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/companyIntelligenceService', () => ({ queryCompanyIntelligence: jest.fn() }));
jest.mock('../../src/utils/agentParserDiagnostics', () => ({ writeAgentParserDiagnostic: jest.fn().mockResolvedValue(undefined) }));

import { submitAgentWorkflow, listAgentWorkflows } from '../../src/services/agentWorkflowService';
import { AgentWorkflowModel } from '../../src/models/AgentWorkflow';
import { ProjectModel } from '../../src/models/Project';
import { EmployeeModel } from '../../src/models/Employee';
import { listTasks } from '../../src/services/taskService';
import { createTaskReassignmentRequest } from '../../src/services/approvalService';
import { env } from '../../src/config/env';
import { queryCompanyIntelligence } from '../../src/services/companyIntelligenceService';

const runs = AgentWorkflowModel as unknown as { create: jest.Mock; find: jest.Mock };
const projects = ProjectModel as unknown as { findById: jest.Mock };
const employees = EmployeeModel as unknown as { find: jest.Mock };
const overdue = listTasks as jest.Mock;
const requestReassignment = createTaskReassignmentRequest as jest.Mock;
const companyIntelligence = queryCompanyIntelligence as jest.Mock;
const actor = { id: '64b000000000000000000001', role: 'MANAGER' as const };

beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });

it('routes the exact manager reporting request through the LLM prompt, parser, allowlist and intelligence service', async () => {
  const request = 'List all managers and their direct-report employees.';
  const answer = { tool: 'company_intelligence', arguments: { view: 'managers_and_reports' }, rationale: 'Show direct reporting relationships.' };
  (global.fetch as jest.Mock).mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain('"List all managers and their direct-report employees"');
    expect(body.messages[0].content).toContain('company_intelligence');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) };
  });
  companyIntelligence.mockResolvedValue({ view: 'managers_and_reports', records: [{ manager: 'Manager', directReports: [] }] });
  runs.create.mockImplementation(async (value) => ({ toObject: () => ({ ...value, _id: 'run-ci' }) }));

  await submitAgentWorkflow(actor, request);

  expect(companyIntelligence).toHaveBeenCalledWith(actor, 'managers_and_reports', undefined);
  expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({ tool: 'company_intelligence', risk: 'LOW', status: 'COMPLETED' }));
});

function mockReassignmentScope(input: { tasks: Array<{ _id: string; title: string; projectId: string }>; members?: Array<{ _id: string; userId: { name: string; isActive: boolean } }> }) {
  overdue.mockResolvedValue({ tasks: input.tasks, pagination: { total: input.tasks.length, totalPages: 1 } });
  projects.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ members: ['64b000000000000000000003'] }) }) });
  employees.find.mockReturnValue({ populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(input.members ?? [{ _id: '64b000000000000000000003', userId: { name: '[DEMO] Jamie Chen', isActive: true } }]) }) });
}

it('executes only the role-scoped overdue read tool and persists a low-risk result', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'list_overdue_tasks', arguments: {}, rationale: 'List overdue tasks' }) } }] }) });
  overdue.mockResolvedValue({ tasks: [{ _id: 'task1' }], pagination: { total: 1 } });
  runs.create.mockImplementation(async (value) => ({ toObject: () => ({ ...value, _id: 'run1' }) }));
  const result = await submitAgentWorkflow(actor, 'Show overdue tasks');
  expect(overdue).toHaveBeenCalledWith(actor, { overdue: true, limit: 100, page: 1 });
  expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({ tool: 'list_overdue_tasks', risk: 'LOW', status: 'COMPLETED' }));
  expect(result.workflow.result).toEqual({ total: 1, tasks: [{ _id: 'task1' }] });
});

it('streams provider rationale incrementally, then validates and executes the typed plan', async () => {
  const chunks = `data: ${JSON.stringify({ choices: [{ delta: { content: '{"tool":"list_overdue_tasks","arguments":{},"rationale":"I found overdue tasks."}' } }] })}\n\n`;
  const encoded = new TextEncoder().encode(chunks);
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    body: new ReadableStream({ start(controller) { controller.enqueue(encoded); controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); controller.close(); } }),
  });
  overdue.mockResolvedValue({ tasks: [], pagination: { total: 0 } });
  runs.create.mockImplementation(async (value) => ({ toObject: () => value }));
  const progress: Array<{ type: string; phase?: string; text?: string }> = [];

  const result = await submitAgentWorkflow(actor, 'Show overdue tasks', (event) => progress.push(event));

  expect(progress[0]).toEqual({ type: 'phase', phase: 'planning' });
  expect(progress.some((event) => event.type === 'text' && event.text === 'I found overdue tasks.')).toBe(true);
  expect(progress).toContainEqual({ type: 'phase', phase: 'running_tool' });
  expect(result.workflow).toMatchObject({ tool: 'list_overdue_tasks', rationale: 'I found overdue tasks.' });
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({ stream: true });
});

it.each(['```json\n{"tool":"list_overdue_tasks","arguments":{},"rationale":"List overdue tasks"}\n```', '```\n{"tool":"list_overdue_tasks","arguments":{},"rationale":"List overdue tasks"}\n```'])('accepts a valid plan wrapped in a Markdown fence', async (content) => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
  overdue.mockResolvedValue({ tasks: [], pagination: { total: 0 } });
  runs.create.mockImplementation(async (value) => ({ toObject: () => value }));
  await expect(submitAgentWorkflow(actor, 'Show overdue tasks')).resolves.toMatchObject({ workflow: { tool: 'list_overdue_tasks', risk: 'LOW' } });
});

it('returns a clear error for malformed JSON without creating a workflow', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"tool":\n```' } }] }) });
  await expect(submitAgentWorkflow(actor, 'Show overdue tasks')).rejects.toThrow('The AI response was not valid JSON. Please try again.');
  expect(runs.create).not.toHaveBeenCalled();
  expect(overdue).not.toHaveBeenCalled();
});

it('rejects a syntactically valid plan that names an unregistered tool', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'execute_sql', arguments: { query: 'SELECT 1' }, rationale: 'Unsupported' }) } }] }) });
  await expect(submitAgentWorkflow(actor, 'Run a query')).rejects.toThrow('The AI response did not contain a supported action.');
  expect(runs.create).not.toHaveBeenCalled();
  expect(overdue).not.toHaveBeenCalled();
});

it('routes high-risk reassignment through the existing approval service only', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: '[DEMO] Review multiplayer reconnect flow', targetEmployeeName: 'Jamie Chen' }, rationale: 'Approval required' }) } }] }) });
  mockReassignmentScope({ tasks: [{ _id: '64b000000000000000000002', title: '[DEMO] Review multiplayer reconnect flow', projectId: '64b000000000000000000004' }] });
  requestReassignment.mockResolvedValue({ _id: 'approval1', fromAssignedTo: 'original' });
  runs.create.mockImplementation(async (value) => ({ toObject: () => value }));
  const result = await submitAgentWorkflow(actor, 'Reassign task');
  expect(requestReassignment).toHaveBeenCalledWith(actor, '64b000000000000000000002', '64b000000000000000000003');
  expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({ risk: 'HIGH', status: 'AWAITING_APPROVAL', approvalId: 'approval1' }));
  expect(result.workflow.result).toEqual(expect.objectContaining({ snapshotCaptured: true, backup: expect.stringContaining('Original assignee') }));
});

it('matches a prefixed request name to the unprefixed active project member exactly', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Task title', targetEmployeeName: '[DEMO] Jamie Chen' }, rationale: 'Approval required' }) } }] }) });
  mockReassignmentScope({ tasks: [{ _id: '64b000000000000000000002', title: 'Task title', projectId: '64b000000000000000000004' }], members: [{ _id: '64b000000000000000000003', userId: { name: 'Jamie Chen', isActive: true } }] });
  requestReassignment.mockResolvedValue({ _id: 'approval1' });
  runs.create.mockImplementation(async (value) => ({ toObject: () => value }));
  await submitAgentWorkflow(actor, 'Reassign Task title to [DEMO] Jamie Chen');
  expect(requestReassignment).toHaveBeenCalledWith(actor, '64b000000000000000000002', '64b000000000000000000003');
});

it('does not persist or claim execution when the existing approval service rejects the reassignment', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Task title', targetEmployeeName: 'Jamie Chen' }, rationale: 'Request reassignment' }) } }] }) });
  mockReassignmentScope({ tasks: [{ _id: '64b000000000000000000002', title: 'Task title', projectId: '64b000000000000000000004' }] });
  requestReassignment.mockRejectedValue(new Error('Task is outside the actor scope'));
  await expect(submitAgentWorkflow(actor, 'Reassign task')).rejects.toThrow('Task is outside the actor scope');
  expect(runs.create).not.toHaveBeenCalled();
});

it('fails clearly when no matching task is in the actor’s role-scoped task list', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Missing task', targetEmployeeName: 'Jamie Chen' }, rationale: 'Request reassignment' }) } }] }) });
  overdue.mockResolvedValue({ tasks: [], pagination: { total: 0, totalPages: 1 } });
  await expect(submitAgentWorkflow(actor, 'Reassign Missing task to Jamie Chen')).rejects.toThrow(/No task with that title/);
  expect(requestReassignment).not.toHaveBeenCalled();
});

it('rejects ambiguous exact task-title matches', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Shared task', targetEmployeeName: 'Jamie Chen' }, rationale: 'Request reassignment' }) } }] }) });
  overdue.mockResolvedValue({ tasks: [
    { _id: '64b000000000000000000002', title: 'Shared task', projectId: '64b000000000000000000004' },
    { _id: '64b000000000000000000005', title: 'Shared task', projectId: '64b000000000000000000006' },
  ], pagination: { total: 2, totalPages: 1 } });
  await expect(submitAgentWorkflow(actor, 'Reassign Shared task to Jamie Chen')).rejects.toThrow(/More than one accessible task/);
  expect(requestReassignment).not.toHaveBeenCalled();
});

it('rejects a missing active project member by employee name', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Task title', targetEmployeeName: 'Jamie Chen' }, rationale: 'Request reassignment' }) } }] }) });
  mockReassignmentScope({ tasks: [{ _id: '64b000000000000000000002', title: 'Task title', projectId: '64b000000000000000000004' }], members: [] });
  await expect(submitAgentWorkflow(actor, 'Reassign Task title to Jamie Chen')).rejects.toThrow(/active member of the selected task’s project/);
  expect(requestReassignment).not.toHaveBeenCalled();
});

it('does not resolve an employee who is outside the project membership list', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'request_task_reassignment', arguments: { taskTitle: 'Task title', targetEmployeeName: 'Jamie Chen' }, rationale: 'Request reassignment' }) } }] }) });
  mockReassignmentScope({ tasks: [{ _id: '64b000000000000000000002', title: 'Task title', projectId: '64b000000000000000000004' }], members: [{ _id: '64b000000000000000000007', userId: { name: 'Taylor Morgan', isActive: true } }] });
  await expect(submitAgentWorkflow(actor, 'Reassign Task title to Jamie Chen')).rejects.toThrow(/active member of the selected task’s project/);
  expect(employees.find).toHaveBeenCalledWith({ _id: { $in: ['64b000000000000000000003'] }, isActive: true });
  expect(requestReassignment).not.toHaveBeenCalled();
});

it('rejects unregistered tools and refuses unconfigured AI without fabricating a plan', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tool: 'run_shell', arguments: {}, rationale: 'unsupported' }) } }] }) });
  await expect(submitAgentWorkflow(actor, 'Do something unsupported')).rejects.toThrow(/supported action/);
  (env.ai as { apiKey: string }).apiKey = '';
  await expect(submitAgentWorkflow(actor, 'Show overdue tasks')).rejects.toThrow(/not configured/);
  expect(runs.create).not.toHaveBeenCalled();
  (env.ai as { apiKey: string }).apiKey = 'test';
});

it('limits non-admin workflow history to the caller', async () => {
  const query = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
  runs.find.mockReturnValue(query);
  await listAgentWorkflows(actor);
  expect(runs.find).toHaveBeenCalledWith({ userId: actor.id });
  expect(query.populate).toHaveBeenCalledWith({ path: 'approvalId', select: 'status' });
});

it('reports persistent provider unavailability before executing a streaming workflow', async () => {
  (global.fetch as jest.Mock).mockImplementation(async () => new Response(null, { status: 503 }));
  const progress = jest.fn();
  await expect(submitAgentWorkflow(actor, 'Show overdue tasks', progress)).rejects.toMatchObject({
    message: 'The AI provider is temporarily unavailable. Please try again shortly.',
  });
  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(progress.mock.calls).toEqual([[{ type: 'phase', phase: 'planning' }]]);
  expect(overdue).not.toHaveBeenCalled();
  expect(runs.create).not.toHaveBeenCalled();
});
