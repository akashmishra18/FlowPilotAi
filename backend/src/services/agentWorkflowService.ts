import { env } from '../config/env';
import { AgentWorkflowModel } from '../models/AgentWorkflow';
import { AppError } from '../utils/AppError';
import { recordAuditEvent } from './auditService';
import { createTaskReassignmentRequest } from './approvalService';
import { listTasks } from './taskService';
import { Role } from '../config/constants';
import { ProjectModel } from '../models/Project';
import { EmployeeModel } from '../models/Employee';
import { CompanyIntelligenceView, queryCompanyIntelligence } from './companyIntelligenceService';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { writeAgentParserDiagnostic } from '../utils/agentParserDiagnostics';
import { fetchWithTransientProviderRetry } from '../ai/providerHttp';

interface Actor { id: string; role: Role }
type Plan = { tool: 'list_overdue_tasks' | 'request_task_reassignment' | 'company_intelligence'; arguments: Record<string, unknown>; rationale: string };
export type AgentWorkflowProgress = { type: 'phase'; phase: 'planning' | 'running_tool' | 'awaiting_approval' } | { type: 'text'; text: string };
type ParserContext = { requestId: string; provider: string; model: string; httpStatus: number | null; finishReason: string | null; responseStructure: string };

async function readStreamingPlan(response: Response, diagnostic: ParserContext, onRationale?: (text: string) => void): Promise<Plan> {
  if (!response.body) throw new AppError('AI provider did not return a stream. Please try again.', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let streamedRationale = '';
  let finishReason: string | null = null;
  const acceptLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let event: { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }> };
    try { event = JSON.parse(data) as typeof event; }
    catch { throw new AppError('AI provider returned an invalid streaming response. Please try again.', 502); }
    const eventFinishReason = event.choices?.[0]?.finish_reason;
    if (typeof eventFinishReason === 'string') finishReason = eventFinishReason;
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta !== 'string') return;
    content += delta;
    const marker = /"rationale"\s*:\s*"/.exec(content);
    if (!marker || !onRationale) return;
    const start = marker.index + marker[0].length;
    let escaped = false;
    let end = -1;
    for (let index = start; index < content.length; index += 1) {
      if (escaped) { escaped = false; continue; }
      if (content[index] === '\\') { escaped = true; continue; }
      if (content[index] === '"') { end = index; break; }
    }
    const raw = content.slice(start, end < 0 ? content.length : end);
    let rationale: string;
    try { rationale = JSON.parse(`"${raw}"`) as string; }
    catch { return; }
    if (rationale.startsWith(streamedRationale)) {
      const next = rationale.slice(streamedRationale.length);
      if (next) onRationale(next);
      streamedRationale = rationale;
    }
  };

  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    const { value } = chunk;
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      acceptLine(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) acceptLine(buffer.replace(/\r$/, ''));
  const responseStructure = 'SSE choices[].delta.content and choices[].finish_reason';
  logger.info('Agent provider streaming response summary', { ...diagnostic, httpStatus: response.status, finishReason, responseContentType: response.headers?.get?.('content-type') ?? null, responseStructure, hasChoicesDeltaContent: Boolean(content), contentLength: content.length });
  return parsePlan(content, { ...diagnostic, httpStatus: response.status, finishReason, responseStructure });
}

function parsePlan(content: string, diagnostic: ParserContext): Plan {
  let json = content.trim();
  if (json.startsWith('```') || json.endsWith('```')) {
    const fenced = json.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fenced) {
      void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: false, extractedAction: null, rejectionCategory: 'malformed_json', sanitizedReason: 'Markdown fence did not contain a complete JSON block' });
      throw new AppError('The AI response was not valid JSON. Please try again.', 502);
    }
    json = fenced[1].trim();
  }

  let value: unknown;
  try { value = JSON.parse(json); }
  catch {
    logger.warn('Agent action parser rejected provider response', { ...diagnostic, rejectionReason: 'invalid_json', jsonParsingSucceeded: false, contentLength: content.length });
    void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: false, extractedAction: null, rejectionCategory: 'malformed_json', sanitizedReason: 'JSON.parse failed for extracted message content' });
    throw new AppError('The AI response was not valid JSON. Please try again.', 502);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: true, extractedAction: null, rejectionCategory: 'invalid_plan_shape', sanitizedReason: 'Parsed JSON must be an object' });
    throw new AppError('The AI response did not contain a supported action. Try listing overdue tasks or requesting a task reassignment.', 400);
  }
  const candidate = value as Record<string, unknown>;
  logger.info('Agent plan JSON parsed', { ...diagnostic, jsonParsingSucceeded: true, extractedAction: typeof candidate.tool === 'string' ? candidate.tool.slice(0, 80) : null });
  if (!['list_overdue_tasks', 'request_task_reassignment', 'company_intelligence'].includes(String(candidate.tool))) {
    void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: true, extractedAction: typeof candidate.tool === 'string' ? candidate.tool : null, rejectionCategory: 'unsupported_action', sanitizedReason: 'Action name is not in the fixed allowlist' });
    logger.warn('Agent action parser rejected provider response', { ...diagnostic, rejectionReason: 'unsupported_action', jsonParsingSucceeded: true, extractedAction: typeof candidate.tool === 'string' ? candidate.tool.slice(0, 80) : null });
    throw new AppError('The AI response did not contain a supported action. Try listing overdue tasks or requesting a task reassignment.', 400);
  }
  if (!candidate.arguments || typeof candidate.arguments !== 'object' || Array.isArray(candidate.arguments) || typeof candidate.rationale !== 'string') {
    void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: true, extractedAction: String(candidate.tool), rejectionCategory: 'invalid_plan_shape', sanitizedReason: 'Plan must contain an arguments object and rationale string' });
    logger.warn('Agent action parser rejected provider response', { ...diagnostic, rejectionReason: 'unsupported_action_or_invalid_plan_shape', jsonParsingSucceeded: true, extractedAction: typeof candidate.tool === 'string' ? candidate.tool.slice(0, 80) : null, hasArgumentsObject: Boolean(candidate.arguments && typeof candidate.arguments === 'object' && !Array.isArray(candidate.arguments)), hasRationale: typeof candidate.rationale === 'string' });
    throw new AppError('The AI response did not contain a supported action. Try listing overdue tasks or requesting a task reassignment.', 400);
  }
  const tool = candidate.tool as Plan['tool'];
  const rationale = candidate.rationale.trim().slice(0, 500);
  if (tool === 'list_overdue_tasks') return { tool, arguments: {}, rationale };
  if (tool === 'company_intelligence') {
    const { view, subject } = candidate.arguments as Record<string, unknown>;
    const supportedViews: CompanyIntelligenceView[] = ['managers_and_reports', 'employee_projects', 'employee_tasks', 'project_overview', 'pending_tasks', 'overdue_tasks', 'employee_summary', 'team_summary'];
    if (typeof view !== 'string' || !supportedViews.includes(view as CompanyIntelligenceView) || (subject !== undefined && (typeof subject !== 'string' || subject.trim().length < 2 || subject.length > 100))) {
      void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: true, extractedAction: tool, rejectionCategory: 'missing_required_fields', sanitizedReason: 'company_intelligence requires a supported view and optional valid subject' });
      throw new AppError('The company information request was unclear. Ask about managers, projects, employees, or tasks.', 400);
    }
    return { tool, arguments: { view, ...(typeof subject === 'string' ? { subject: subject.trim() } : {}) }, rationale };
  }
  const { taskTitle, targetEmployeeName } = candidate.arguments as Record<string, unknown>;
  if (typeof taskTitle !== 'string' || !taskTitle.trim() || typeof targetEmployeeName !== 'string' || !targetEmployeeName.trim()) {
    void writeAgentParserDiagnostic({ ...diagnostic, jsonParsingSucceeded: true, extractedAction: tool, rejectionCategory: 'missing_required_fields', sanitizedReason: 'Reassignment requires taskTitle and targetEmployeeName' });
    throw new AppError('The reassignment request needs a task title and the target employee’s name.', 400);
  }
  return { tool, arguments: { taskTitle: taskTitle.trim(), targetEmployeeName: targetEmployeeName.trim() }, rationale };
}

function normalizeMatch(value: string): string {
  return value.trim().replace(/^\[DEMO\]\s*/, '').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function referenceId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) return String((value as { _id: unknown })._id);
  return String(value);
}

async function resolveReassignmentTargets(actor: Actor, taskTitle: string, targetEmployeeName: string) {
  const matches: Array<{ _id: unknown; title: string; projectId: unknown }> = [];
  const firstPage = await listTasks(actor, { search: taskTitle, limit: 100, page: 1 });
  const pageCount = Math.max(1, firstPage.pagination.totalPages);
  for (let page = 1; page <= pageCount; page += 1) {
    const result = page === 1 ? firstPage : await listTasks(actor, { search: taskTitle, limit: 100, page });
    matches.push(...result.tasks.filter((task) => normalizeMatch(task.title) === normalizeMatch(taskTitle)) as typeof matches);
    if (matches.length > 1) throw new AppError('More than one accessible task has that title. Please clarify which project or task you mean.', 400);
  }
  if (matches.length === 0) throw new AppError('No task with that title was found in your accessible work. Check the task name and your project access.', 404);

  const task = matches[0];
  const projectId = referenceId(task.projectId);
  if (!projectId) throw new AppError('The selected task has no valid project relationship.', 400);
  const project = await ProjectModel.findById(projectId).select('members').lean() as { members?: unknown[] } | null;
  if (!project) throw new AppError('The selected task’s project could not be found.', 404);
  const memberIds = (project.members ?? []).map(referenceId).filter((id): id is string => Boolean(id));
  if (memberIds.length === 0) throw new AppError('The selected task’s project has no eligible active members.', 400);

  const members = await EmployeeModel.find({ _id: { $in: memberIds }, isActive: true })
    .populate({ path: 'userId', select: 'name isActive' })
    .lean() as Array<{ _id: unknown; userId?: { name?: string; isActive?: boolean } | null }>;
  const eligible = members.filter((member) => member.userId?.isActive === true
    && normalizeMatch(member.userId.name ?? '') === normalizeMatch(targetEmployeeName));
  if (eligible.length === 0) throw new AppError('That employee was not found as an active member of the selected task’s project, or you are not allowed to use that assignment.', 403);
  if (eligible.length > 1) throw new AppError('More than one active project member has that name. Please clarify which employee you mean.', 400);
  return { taskId: String(task._id), assignedTo: String(eligible[0]._id), taskTitle: task.title, targetEmployeeName };
}

async function createPlan(request: string, requestId: string, onRationale?: (text: string) => void): Promise<Plan> {
  if (!['openai', 'gemini'].includes(env.ai.provider) || !env.ai.apiKey || !env.ai.model) throw new AppError('AI provider is not configured; no workflow plan was created.', 503);
  const defaultBase = env.ai.provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta/openai/'
    : 'https://api.openai.com/v1';
  const base = (env.ai.baseUrl.trim() || defaultBase).replace(/\/+$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchWithTransientProviderRetry(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${env.ai.apiKey}`, 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ model: env.ai.model, temperature: 0, stream: Boolean(onRationale), ...(env.ai.provider === 'openai' ? { response_format: { type: 'json_object' } } : {}), messages: [
    { role: 'system', content: 'Choose the best matching tool from this exact allowlist and return JSON only: list_overdue_tasks, company_intelligence, request_task_reassignment. ROUTING RULE: questions asking who manages whom, who reports to whom, manager/direct-report lists, team members, employee project membership, employee workload/tasks, project ownership/progress, or pending/overdue assignments MUST use company_intelligence. Examples: "List all managers and their direct-report employees" -> {"tool":"company_intelligence","arguments":{"view":"managers_and_reports"}}; "Show managers and their teams" -> same; "Which employees report to each manager?" -> same. company_intelligence arguments must be {"view":"managers_and_reports"|"employee_projects"|"employee_tasks"|"project_overview"|"pending_tasks"|"overdue_tasks"|"employee_summary"|"team_summary","subject":"optional exact employee/project name"}. Use read-only views only; never return database queries or IDs. For reassignment, extract taskTitle and targetEmployeeName; never invent IDs. Unsupported requests must use tool="unsupported".' },
      { role: 'user', content: request },
    ] }) }, { requestId, provider: env.ai.provider, model: env.ai.model, apiKey: env.ai.apiKey });
    if (!response.ok) {
      throw new AppError('AI provider could not create a plan.', 502);
    }
    if (onRationale) return await readStreamingPlan(response, { requestId, provider: env.ai.provider, model: env.ai.model, httpStatus: response.status, finishReason: null, responseStructure: 'SSE pending' }, onRationale);
    let payload: { choices?: Array<{ message?: { content?: unknown } }> };
    try { payload = await response.json() as typeof payload; }
    catch { throw new AppError('AI provider returned an invalid plan response.', 502); }
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    const rawFinishReason = (choice as { finish_reason?: unknown } | undefined)?.finish_reason;
    const finishReason = typeof rawFinishReason === 'string' ? rawFinishReason : null;
    const responseStructure = `topLevel:${Object.keys(payload).join(',').slice(0, 120)};choice:${Boolean(choice)};message:${Boolean(choice?.message)};contentType:${typeof content}`;
    logger.info('Agent provider response summary', { requestId, provider: env.ai.provider, model: env.ai.model, httpStatus: response.status, finishReason, responseContentType: response.headers?.get?.('content-type') ?? null, responseStructure, hasChoices: Array.isArray(payload.choices), hasMessageContent: typeof content === 'string' });
    if (typeof content !== 'string') {
      void writeAgentParserDiagnostic({ requestId, provider: env.ai.provider, model: env.ai.model, httpStatus: response.status, finishReason, responseStructure, jsonParsingSucceeded: false, extractedAction: null, rejectionCategory: 'unexpected_response_structure', sanitizedReason: 'Expected choices[0].message.content string' });
      throw new AppError('AI provider returned an unexpected response structure.', 502);
    }
    return parsePlan(content, { requestId, provider: env.ai.provider, model: env.ai.model, httpStatus: response.status, finishReason, responseStructure });
  } finally { clearTimeout(timer); }
}

export async function submitAgentWorkflow(actor: Actor, request: string, onProgress?: (progress: AgentWorkflowProgress) => void, requestId: string = randomUUID()) {
  const normalized = request.trim();
  if (!normalized || normalized.length > 1000) throw new AppError('Request must be between 1 and 1000 characters.', 400);
  onProgress?.({ type: 'phase', phase: 'planning' });
  const plan = await createPlan(normalized, requestId, onProgress ? (text) => onProgress({ type: 'text', text }) : undefined);
  let risk: 'LOW' | 'MEDIUM' | 'HIGH';
  let status: 'COMPLETED' | 'AWAITING_APPROVAL';
  let result: Record<string, unknown>;
  let approvalId = null;
  let workflowArguments = plan.arguments;
  if (plan.tool === 'list_overdue_tasks') {
    risk = 'LOW'; status = 'COMPLETED';
    onProgress?.({ type: 'phase', phase: 'running_tool' });
    const data = await listTasks(actor, { overdue: true, limit: 100, page: 1 });
    result = { total: data.pagination.total, tasks: data.tasks };
  } else if (plan.tool === 'request_task_reassignment') {
    risk = 'HIGH'; status = 'AWAITING_APPROVAL';
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER' && actor.role !== 'EMPLOYEE' && actor.role !== 'TEAM_LEAD') throw new AppError('Role cannot request task changes.', 403);
    onProgress?.({ type: 'phase', phase: 'running_tool' });
    const { taskId, assignedTo, taskTitle, targetEmployeeName } = await resolveReassignmentTargets(actor, String(plan.arguments.taskTitle), String(plan.arguments.targetEmployeeName));
    const approval = await createTaskReassignmentRequest(actor, taskId, assignedTo);
    onProgress?.({ type: 'phase', phase: 'awaiting_approval' });
    approvalId = approval._id;
    workflowArguments = { taskTitle, targetEmployeeName };
    // Existing approval captures fromAssignedTo as the reversible pre-change snapshot.
    result = { taskTitle, targetEmployeeName, approvalId: String(approval._id), snapshotCaptured: true, backup: 'Original assignee captured by task reassignment approval.' };
  } else {
    risk = 'LOW'; status = 'COMPLETED';
    onProgress?.({ type: 'phase', phase: 'running_tool' });
    result = await queryCompanyIntelligence(actor, plan.arguments.view as CompanyIntelligenceView, plan.arguments.subject as string | undefined) as unknown as Record<string, unknown>;
  }
  if (plan.tool === 'company_intelligence') workflowArguments = plan.arguments;
  const workflow = await AgentWorkflowModel.create({ userId: actor.id, request: normalized, tool: plan.tool, arguments: workflowArguments, rationale: plan.rationale, risk, status, result, approvalId });
  await recordAuditEvent({ actorUserId: actor.id, actorRole: actor.role, action: 'AGENT_WORKFLOW_SUBMITTED', targetType: 'AgentWorkflow', targetId: String(workflow._id), outcome: 'SUCCESS', after: { tool: plan.tool, risk, status, approvalId } });
  return { workflow: { ...workflow.toObject(), rationale: plan.rationale } };
}

export async function listAgentWorkflows(actor: Actor) {
  const filter = actor.role === 'ADMIN' ? {} : { userId: actor.id };
  const workflows = await AgentWorkflowModel.find(filter).populate({ path: 'approvalId', select: 'status' }).sort({ createdAt: -1 }).limit(100).lean();
  return { workflows };
}
