import { Types } from 'mongoose';
import { Role } from '../config/constants';
import { ClientIssueModel, ClientIssuePriority, ClientIssueStatus } from '../models/ClientIssue';
import { EmployeeModel } from '../models/Employee';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { recordAuditEvent } from './auditService';
import { persistNotification } from './messagingService';

interface Actor { id: string; role: Role }
interface CreateInput { clientName: string; message: string; priority?: ClientIssuePriority; receivedAt?: string; projectId?: string | null }

async function allowedProjectIds(actor: Actor): Promise<Types.ObjectId[] | null> {
  if (actor.role === 'ADMIN') return null;
  if (actor.role === 'MANAGER') return (await ProjectModel.find({ managerId: actor.id }).select('_id').lean()).map((p) => p._id as Types.ObjectId);
  const employee = await EmployeeModel.findOne({ userId: actor.id, isActive: true }).select('_id').lean() as { _id: Types.ObjectId } | null;
  if (!employee) return [];
  const projects = await ProjectModel.find({ members: employee._id, isActive: true }).select('_id').lean();
  return projects.map((p) => p._id as Types.ObjectId);
}

export async function listClientIssues(actor: Actor, status?: ClientIssueStatus) {
  const projectIds = await allowedProjectIds(actor);
  const filter: Record<string, unknown> = {};
  if (projectIds) filter.$or = [{ projectId: { $in: projectIds } }, { createdBy: actor.id }];
  if (status) filter.status = status;
  const issues = await ClientIssueModel.find(filter).populate('projectId', 'name projectCode').populate({ path: 'assignedTo', select: 'employeeId userId', populate: { path: 'userId', select: 'name' } }).populate('taskId', 'title status').sort({ receivedAt: -1 }).limit(200).lean();
  return { issues };
}

export async function createClientIssue(actor: Actor, input: CreateInput) {
  if (!['ADMIN', 'MANAGER', 'EMPLOYEE', 'TEAM_LEAD'].includes(actor.role)) throw new AppError('Not authorized to record client issues', 403);
  if (input.projectId && !Types.ObjectId.isValid(input.projectId)) throw new AppError('Invalid projectId', 400);
  const projectIds = await allowedProjectIds(actor);
  if (input.projectId && projectIds && !projectIds.some((id) => String(id) === input.projectId)) throw new AppError('Project is outside your permitted scope', 403);
  const issue = await ClientIssueModel.create({ ...input, projectId: input.projectId || null, createdBy: actor.id, receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date() });
  await recordAuditEvent({ actorUserId: actor.id, actorRole: actor.role, action: 'CLIENT_ISSUE_CREATED', targetType: 'ClientIssue', targetId: String(issue._id), outcome: 'SUCCESS', after: { priority: issue.priority, status: issue.status, projectId: issue.projectId } });
  if (['HIGH', 'URGENT'].includes(issue.priority)) {
    const recipients = issue.projectId
      ? [String((await ProjectModel.findById(issue.projectId).select('managerId').lean() as { managerId?: Types.ObjectId } | null)?.managerId ?? '')]
      : (await UserModel.find({ role: 'ADMIN', isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>).map((u) => String(u._id));
    await Promise.all([...new Set(recipients.filter(Boolean))].map((userId) => persistNotification({ userId, type: 'APPROVAL_UPDATE', title: 'High-priority client issue', body: `${issue.clientName}: ${issue.message.slice(0, 160)}`, href: '/client-issues', dedupeKey: `client-issue:${issue._id}:${userId}` })));
  }
  return { issue };
}

export async function updateClientIssue(actor: Actor, issueId: string, updates: { status?: ClientIssueStatus; assignedTo?: string | null; taskId?: string | null }) {
  if (!['ADMIN', 'MANAGER'].includes(actor.role)) throw new AppError('Only an admin or manager can update client issues', 403);
  if (!Types.ObjectId.isValid(issueId)) throw new AppError('Invalid issue id', 400);
  const issue = await ClientIssueModel.findById(issueId);
  if (!issue) throw new AppError('Client issue not found', 404);
  const projectIds = await allowedProjectIds(actor);
  if (projectIds && (!issue.projectId || !projectIds.some((id) => String(id) === String(issue.projectId)))) throw new AppError('Issue is outside your permitted scope', 403);
  if (updates.assignedTo) {
    const employee = await EmployeeModel.findOne({ _id: updates.assignedTo, isActive: true }).select('_id').lean() as { _id: Types.ObjectId } | null;
    if (!employee) throw new AppError('Assignee must be an active employee', 400);
    if (issue.projectId && !await ProjectModel.exists({ _id: issue.projectId, members: employee._id, isActive: true })) throw new AppError('Assignee must be an active member of the issue project', 400);
  }
  if (updates.taskId) {
    const task = await TaskModel.findById(updates.taskId).select('projectId').lean() as { projectId: Types.ObjectId } | null;
    if (!task || !issue.projectId || String(task.projectId) !== String(issue.projectId)) throw new AppError('Linked task must belong to the issue project', 400);
  }
  if (updates.status) issue.status = updates.status;
  if (updates.assignedTo !== undefined) issue.assignedTo = updates.assignedTo ? new Types.ObjectId(updates.assignedTo) : null;
  if (updates.taskId !== undefined) issue.taskId = updates.taskId ? new Types.ObjectId(updates.taskId) : null;
  await issue.save();
  await recordAuditEvent({ actorUserId: actor.id, actorRole: actor.role, action: 'CLIENT_ISSUE_UPDATED', targetType: 'ClientIssue', targetId: issueId, outcome: 'SUCCESS', after: updates });
  return { issue };
}
