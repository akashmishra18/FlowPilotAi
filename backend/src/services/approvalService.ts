import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { Role } from '../config/constants';
import { TaskReassignmentApprovalModel } from '../models/TaskReassignmentApproval';
import { ProjectModel } from '../models/Project';
import { EmployeeModel } from '../models/Employee';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { AppError } from '../utils/AppError';
import { recordAuditEvent, recordAuditFailure } from './auditService';
import * as taskService from './taskService';
import { persistNotification } from './messagingService';
import { logger } from '../utils/logger';

interface RequestingUser { id: string; role: Role }
const POPULATE_TASK = { path: 'taskId', select: 'title status dueDate' };
const POPULATE_PROJECT = { path: 'projectId', select: 'name projectCode' };
const POPULATE_USER = { path: 'requestedBy', select: 'name email role' };
const POPULATE_EMPLOYEE = { path: 'assignedTo', select: 'employeeId department designation', populate: { path: 'userId', select: 'name' } };
const POPULATE_FROM_EMPLOYEE = { path: 'fromAssignedTo', select: 'employeeId', populate: { path: 'userId', select: 'name' } };

function assertObjectId(value: string, label: string): void {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
}

async function notifyApproval(input: { approvalId: string; taskId: string; projectId: string; requesterId: string; targetEmployeeId: string; previousEmployeeId?: string | null; decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED' }) {
  try {
    const [task, requester, project, targetEmployee, previousEmployee] = await Promise.all([
      TaskModel.findById(input.taskId).select('title').lean() as Promise<{ title: string } | null>,
      UserModel.findById(input.requesterId).select('name').lean() as Promise<{ name: string } | null>,
      ProjectModel.findById(input.projectId).select('managerId').lean() as Promise<{ managerId: Types.ObjectId } | null>,
      EmployeeModel.findById(input.targetEmployeeId).select('userId').lean() as Promise<{ userId: Types.ObjectId } | null>,
      input.previousEmployeeId ? EmployeeModel.findById(input.previousEmployeeId).select('userId').lean() as Promise<{ userId: Types.ObjectId } | null> : Promise.resolve(null),
    ]);
    if (!task) return;
    let recipients: string[];
    if (input.decision === 'SUBMITTED') {
      const admins = await UserModel.find({ role: 'ADMIN', isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>;
      recipients = [...admins.map((user) => String(user._id)), ...(project?.managerId ? [String(project.managerId)] : [])];
    } else {
      recipients = [input.requesterId, ...(targetEmployee?.userId ? [String(targetEmployee.userId)] : []), ...(previousEmployee?.userId ? [String(previousEmployee.userId)] : [])];
    }
    const uniqueRecipients = [...new Set(recipients)];
    const requesterName = requester?.name ?? 'A FlowPilot user';
    const title = input.decision === 'SUBMITTED' ? 'Task reassignment needs review' : `Task reassignment ${input.decision.toLowerCase()}`;
    const body = input.decision === 'SUBMITTED'
      ? `${requesterName} requested a reassignment for “${task.title}”.`
      : `“${task.title}” requested by ${requesterName} was ${input.decision.toLowerCase()}.`;
    await Promise.all(uniqueRecipients.map((userId) => persistNotification({
      userId, type: 'APPROVAL_UPDATE', title, body: body.slice(0, 300),
      href: input.decision === 'SUBMITTED' ? `/approvals?request=${input.approvalId}` : `/tasks?task=${input.taskId}`,
      taskId: input.taskId, dedupeKey: `approval:${input.approvalId}:${input.decision}:${userId}`,
    })));
  } catch (error) {
    // Notification persistence never changes approval behavior; its delivery status remains visible in Notifications.
    logger.warn('Approval notification preparation failed', { approvalId: input.approvalId, decision: input.decision, errorType: error instanceof Error ? error.name : 'UnknownError' });
  }
}

async function assertCanReview(requestingUser: RequestingUser, projectId: string, approvalId: string): Promise<void> {
  if (requestingUser.role === 'ADMIN') return;
  if (requestingUser.role === 'MANAGER') {
    const project = await ProjectModel.findById(projectId).select('managerId').lean() as { managerId?: unknown } | null;
    if (project && String(project.managerId) === requestingUser.id) return;
  }
  await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_APPROVAL_UNAUTHORIZED', targetType: 'TaskReassignmentApproval', targetId: approvalId, error: { code: '403', message: 'Unauthorized approval decision' } });
  throw new AppError('Only the project manager or an admin can decide this request', 403);
}

export async function createTaskReassignmentRequest(requestingUser: RequestingUser, taskId: string, assignedTo: string) {
  assertObjectId(taskId, 'taskId');
  assertObjectId(assignedTo, 'assignedTo');
  const target = await taskService.validateReassignmentRequest(requestingUser, taskId, assignedTo);
  const approval = await TaskReassignmentApprovalModel.create({
    ...target,
    requestedBy: requestingUser.id,
    requesterRole: requestingUser.role,
    status: 'PENDING',
  });
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_REQUESTED', targetType: 'TaskReassignmentApproval', targetId: approval._id.toString(), outcome: 'SUCCESS', after: { taskId: approval.taskId, fromAssignedTo: approval.fromAssignedTo, assignedTo: approval.assignedTo } });
  await notifyApproval({ approvalId: String(approval._id), taskId: String(approval.taskId), projectId: String(approval.projectId), requesterId: requestingUser.id, targetEmployeeId: String(approval.assignedTo), previousEmployeeId: approval.fromAssignedTo ? String(approval.fromAssignedTo) : null, decision: 'SUBMITTED' });
  return approval;
}

export async function listTaskReassignmentRequests(requestingUser: RequestingUser) {
  let filter: Record<string, unknown> = {};
  if (requestingUser.role === 'ADMIN') {
    filter = {};
  } else if (requestingUser.role === 'MANAGER') {
    const projects = await ProjectModel.find({ managerId: requestingUser.id }).select('_id').lean();
    const projectIds = projects.map((project) => project._id);
    filter = { projectId: { $in: projectIds } };
  } else {
    filter = { requestedBy: requestingUser.id };
  }
  const requests = await TaskReassignmentApprovalModel.find(filter)
    .populate(POPULATE_TASK)
    .populate(POPULATE_PROJECT)
    .populate(POPULATE_USER)
    .populate(POPULATE_EMPLOYEE)
    .populate(POPULATE_FROM_EMPLOYEE)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return { requests };
}

export async function approveTaskReassignment(requestingUser: RequestingUser, id: string) {
  assertObjectId(id, 'approval id');
  if (!['ADMIN', 'MANAGER'].includes(requestingUser.role)) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_APPROVAL_UNAUTHORIZED', targetType: 'TaskReassignmentApproval', targetId: id, error: { code: '403', message: 'Only managers/admins may approve' } });
    throw new AppError('Only a manager or admin can approve requests', 403);
  }
  const existing = await TaskReassignmentApprovalModel.findById(id).lean();
  if (!existing) throw new AppError('Reassignment request not found', 404);
  await assertCanReview(requestingUser, String(existing.projectId), id);

  if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
    throw new AppError(`This request is already ${String(existing.status).toLowerCase()}`, 409);
  }
  if (!['PENDING', 'EXECUTING', 'FAILED'].includes(existing.status)) {
    throw new AppError('This request cannot be executed in its current state', 409);
  }

  // Each attempt has an atomic claim. EXECUTING/FAILED may be reclaimed by a
  // reviewer after an interrupted/failed attempt; the task service uses a
  // compare-and-set on the original assignee to make that retry idempotent.
  const executionAttemptId = randomUUID();
  const claimFilter = existing.status === 'PENDING'
    ? { _id: id, status: 'PENDING' }
    : { _id: id, status: existing.status, executionAttemptId: existing.executionAttemptId ?? null };
  const claimed = await TaskReassignmentApprovalModel.findOneAndUpdate(
    claimFilter,
    { $set: { status: 'EXECUTING', reviewedBy: requestingUser.id, reviewedAt: new Date(), executionAttemptId } },
    { new: true },
  );
  if (!claimed) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_APPROVAL_DUPLICATE', targetType: 'TaskReassignmentApproval', targetId: id, error: { code: '409', message: 'Request is no longer pending' } });
    throw new AppError('This request is no longer pending', 409);
  }

  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: existing.status === 'PENDING' ? 'TASK_REASSIGNMENT_APPROVAL_GRANTED' : 'TASK_REASSIGNMENT_EXECUTION_RETRY', targetType: 'TaskReassignmentApproval', targetId: id, outcome: 'SUCCESS', after: { taskId: claimed.taskId, assignedTo: claimed.assignedTo, attemptId: executionAttemptId } });

  try {
    await taskService.assignTask(
      requestingUser,
      String(claimed.taskId),
      String(claimed.assignedTo),
      claimed.fromAssignedTo ? String(claimed.fromAssignedTo) : null,
    );
  } catch (error) {
    const message = error instanceof AppError ? error.message.slice(0, 300) : 'Task reassignment failed. Contact an administrator.';
    await TaskReassignmentApprovalModel.updateOne({ _id: id, status: 'EXECUTING', executionAttemptId }, { $set: { status: 'FAILED', executionError: message } });
    await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_EXECUTION_FAILED', targetType: 'TaskReassignmentApproval', targetId: id, outcome: 'FAILURE', error: { message } });
    throw error;
  }

  await TaskReassignmentApprovalModel.updateOne({ _id: id, status: 'EXECUTING', executionAttemptId }, { $set: { status: 'APPROVED', executionError: null } });
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_EXECUTED', targetType: 'Task', targetId: String(claimed.taskId), outcome: 'SUCCESS', after: { assignedTo: claimed.assignedTo, approvalId: id } });
  await notifyApproval({ approvalId: id, taskId: String(claimed.taskId), projectId: String(claimed.projectId), requesterId: String(claimed.requestedBy), targetEmployeeId: String(claimed.assignedTo), previousEmployeeId: claimed.fromAssignedTo ? String(claimed.fromAssignedTo) : null, decision: 'APPROVED' });
  return { request: { ...claimed.toObject(), status: 'APPROVED' } };
}

export async function rejectTaskReassignment(requestingUser: RequestingUser, id: string) {
  assertObjectId(id, 'approval id');
  if (!['ADMIN', 'MANAGER'].includes(requestingUser.role)) {
    await recordAuditFailure({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_APPROVAL_UNAUTHORIZED', targetType: 'TaskReassignmentApproval', targetId: id, error: { code: '403', message: 'Only managers/admins may reject' } });
    throw new AppError('Only a manager or admin can reject requests', 403);
  }
  const existing = await TaskReassignmentApprovalModel.findById(id).lean();
  if (!existing) throw new AppError('Reassignment request not found', 404);
  await assertCanReview(requestingUser, String(existing.projectId), id);
  const rejected = await TaskReassignmentApprovalModel.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    { $set: { status: 'REJECTED', reviewedBy: requestingUser.id, reviewedAt: new Date() } },
    { new: true },
  );
  if (!rejected) throw new AppError('This request is no longer pending', 409);
  await recordAuditEvent({ actorUserId: requestingUser.id, actorRole: requestingUser.role, action: 'TASK_REASSIGNMENT_REJECTED', targetType: 'TaskReassignmentApproval', targetId: id, outcome: 'SUCCESS', after: { taskId: rejected.taskId, assignedTo: rejected.assignedTo } });
  await notifyApproval({ approvalId: id, taskId: String(rejected.taskId), projectId: String(rejected.projectId), requesterId: String(rejected.requestedBy), targetEmployeeId: String(rejected.assignedTo), previousEmployeeId: rejected.fromAssignedTo ? String(rejected.fromAssignedTo) : null, decision: 'REJECTED' });
  return { request: rejected };
}
