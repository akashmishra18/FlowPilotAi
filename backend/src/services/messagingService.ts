import { Types } from 'mongoose';
import { Role } from '../config/constants';
import { ConversationModel } from '../models/Conversation';
import { MessageDocument, MessageModel } from '../models/Message';
import { NotificationModel } from '../models/Notification';
import { EmployeeModel } from '../models/Employee';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { OverdueReminderModel } from '../models/OverdueReminder';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { recordAuditEvent, recordAuditFailure } from './auditService';
import { env } from '../config/env';
import { sendResendEmail } from '../integrations/email/resendEmailProvider';
import { safeFailureDiagnostics } from '../utils/safeFailureDiagnostics';

export interface MessagingActor { id: string; role: Role }
const MESSAGE_ROLES: Role[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];
const USER_FIELDS = 'name role isActive email';

function validId(id: string, label = 'id'): void {
  if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}`, 400);
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function sanitizeMessage(value: unknown): string {
  if (typeof value !== 'string') throw new AppError('Message is required', 400);
  const normalized = value.normalize('NFC');
  const body = Array.from(normalized).filter((character) => {
    const code = character.charCodeAt(0);
    return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127);
  }).join('').trim();
  if (!body || body.length > 4000) throw new AppError('Message must be between 1 and 4000 characters', 400);
  return body;
}

async function findEmployeeForUser(userId: string) {
  return EmployeeModel.findOne({ userId, isActive: true }).select('_id userId managerId isActive').lean() as Promise<{
    _id: Types.ObjectId; userId: Types.ObjectId; managerId: Types.ObjectId | null; isActive: boolean;
  } | null>;
}

/**
 * Conversation permission is checked on every list/read/write. Managers may
 * contact direct reports or active project members on projects they manage.
 */
async function assertCanMessage(actor: MessagingActor, recipientId: string, relatedTaskId?: string, existingConversation = false) {
  validId(actor.id, 'user id');
  validId(recipientId, 'recipient id');
  if (actor.id === recipientId || !MESSAGE_ROLES.includes(actor.role)) throw new AppError('You cannot message this account', 403);
  const recipient = await UserModel.findById(recipientId).select(USER_FIELDS).lean() as { _id: Types.ObjectId; role: Role; isActive: boolean } | null;
  if (!recipient || !recipient.isActive) throw new AppError('Recipient account is unavailable', 404);

  if (actor.role === 'ADMIN') {
    if (!['MANAGER', 'EMPLOYEE'].includes(recipient.role)) throw new AppError('Admins can message managers and employees', 403);
    return recipient;
  }

  if (actor.role === 'EMPLOYEE') {
    if (recipient.role === 'ADMIN' && existingConversation) return recipient;
    if (recipient.role !== 'MANAGER') throw new AppError('Employees can message their reporting manager or reply to an admin message', 403);
    const employee = await findEmployeeForUser(actor.id);
    const manager = employee?.managerId ? await EmployeeModel.findById(employee.managerId).select('userId isActive').lean() as { userId: Types.ObjectId; isActive: boolean } | null : null;
    const directManager = Boolean(manager?.isActive && String(manager.userId) === recipientId);
    let taskManager = false;
    if (!directManager && relatedTaskId && Types.ObjectId.isValid(relatedTaskId) && employee) {
      const task = await TaskModel.findById(relatedTaskId).select('assignedTo projectId').lean() as { assignedTo: Types.ObjectId | null; projectId: Types.ObjectId } | null;
      if (task && String(task.assignedTo) === String(employee._id)) {
        taskManager = Boolean(await ProjectModel.exists({ _id: task.projectId, managerId: recipientId, members: employee._id, isActive: true }));
      }
    }
    if (!directManager && !taskManager) throw new AppError('Employees can message only their reporting manager or the manager of a related task', 403);
    return recipient;
  }

  if (recipient.role !== 'EMPLOYEE') throw new AppError('Managers can message employees in their scope', 403);
  const managerEmployee = await findEmployeeForUser(actor.id);
  const employee = await findEmployeeForUser(recipientId);
  if (!employee) throw new AppError('Employee relationship is unavailable', 403);
  const directReport = Boolean(managerEmployee && String(employee.managerId ?? '') === String(managerEmployee._id));
  let projectMember = false;
  if (!directReport && relatedTaskId && Types.ObjectId.isValid(relatedTaskId)) {
    const task = await TaskModel.findById(relatedTaskId).select('projectId assignedTo').lean() as { projectId: Types.ObjectId; assignedTo: Types.ObjectId | null } | null;
    if (task && String(task.assignedTo) === String(employee._id)) {
      projectMember = Boolean(await ProjectModel.exists({ _id: task.projectId, managerId: actor.id, members: employee._id, isActive: true }));
    }
  }
  if (!directReport && !projectMember) throw new AppError('Managers can message only their assigned employees', 403);
  return recipient;
}

async function getConversationForActor(actor: MessagingActor, conversationId: string) {
  validId(conversationId, 'conversation id');
  const conversation = await ConversationModel.findById(conversationId).lean() as { _id: Types.ObjectId; participants: Types.ObjectId[]; relatedTaskIds?: Types.ObjectId[] } | null;
  if (!conversation || !conversation.participants.some((id) => String(id) === actor.id)) throw new AppError('Conversation not found', 404);
  const otherId = conversation.participants.find((id) => String(id) !== actor.id);
  if (!otherId) throw new AppError('Conversation is invalid', 404);
  try {
    await assertCanMessage(actor, String(otherId), undefined, true);
  } catch (error) {
    let permitted = false;
    for (const taskId of conversation.relatedTaskIds ?? []) {
      try { await assertCanMessage(actor, String(otherId), String(taskId), true); permitted = true; break; } catch { /* try other persisted task context */ }
    }
    if (!permitted) throw error;
  }
  return { conversation, recipientId: String(otherId) };
}

async function getOrCreateConversation(actor: MessagingActor, recipientId: string, relatedTaskId?: string) {
  await assertCanMessage(actor, recipientId, relatedTaskId);
  const key = pairKey(actor.id, recipientId);
  try {
    const result = await ConversationModel.findOneAndUpdate(
      { participantKey: key },
      {
        $setOnInsert: { participants: [actor.id, recipientId], participantKey: key, latestMessageAt: null },
        ...(relatedTaskId ? { $addToSet: { relatedTaskIds: relatedTaskId } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return result;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return ConversationModel.findOne({ participantKey: key }).lean();
  }
}

export async function persistNotification(input: {
  userId: string; type: 'NEW_MESSAGE' | 'OVERDUE_REMINDER' | 'SCHEDULED_SUMMARY' | 'APPROVAL_UPDATE'; title: string; body: string; href: string;
  conversationId?: string; taskId?: string; messageId?: string; dedupeKey: string;
}) {
  const configured = env.email.provider.toLowerCase() === 'resend' && Boolean(env.email.apiKey.trim()) && Boolean(env.email.fromAddress.trim());
  try {
    await NotificationModel.updateOne(
      { userId: input.userId, dedupeKey: input.dedupeKey },
      { $setOnInsert: { ...input, userId: new Types.ObjectId(input.userId), conversationId: input.conversationId ?? null, taskId: input.taskId ?? null, messageId: input.messageId ?? null, inAppStatus: 'DELIVERED', emailStatus: configured ? 'PENDING' : 'NOT_CONFIGURED', readAt: null } },
      { upsert: true },
    );
    const notification = await NotificationModel.findOne({ userId: input.userId, dedupeKey: input.dedupeKey }).lean() as { emailStatus: 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' } | null;
    if (!configured) {
      await NotificationModel.updateOne({ userId: input.userId, dedupeKey: input.dedupeKey }, { $set: { emailStatus: 'NOT_CONFIGURED' } });
      return { inAppStatus: 'DELIVERED', emailStatus: 'NOT_CONFIGURED' };
    }
    if (notification?.emailStatus === 'SENT') return { inAppStatus: 'DELIVERED', emailStatus: 'SENT' };

    const recipient = await UserModel.findById(input.userId).select('email isActive').lean() as { email: string; isActive: boolean } | null;
    if (!recipient?.isActive || !recipient.email) {
      await NotificationModel.updateOne({ userId: input.userId, dedupeKey: input.dedupeKey }, { $set: { emailStatus: 'FAILED' } });
      return { inAppStatus: 'DELIVERED', emailStatus: 'FAILED' };
    }
    await NotificationModel.updateOne({ userId: input.userId, dedupeKey: input.dedupeKey }, { $set: { emailStatus: 'PENDING' } });
    const href = new URL(input.href, env.corsOrigin).toString();
    const emailStatus = await sendResendEmail({ to: recipient.email, subject: input.title, text: input.body, href, idempotencyKey: `flowpilot-notification-${input.dedupeKey}` });
    await NotificationModel.updateOne({ userId: input.userId, dedupeKey: input.dedupeKey }, { $set: { emailStatus } });
    return { inAppStatus: 'DELIVERED', emailStatus };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { inAppStatus: 'DELIVERED', emailStatus: configured ? 'PENDING' : 'NOT_CONFIGURED' };
    logger.error('In-app notification persistence failed', { type: input.type, errorType: error instanceof Error ? error.name : 'UnknownError' });
    return { inAppStatus: 'FAILED', emailStatus: configured ? 'FAILED' : 'NOT_CONFIGURED' };
  }
}

async function writeAudit(input: Parameters<typeof recordAuditEvent>[0]) {
  try { await recordAuditEvent(input); }
  catch (error) { logger.error('Messaging audit event persistence failed', { action: input.action, errorType: error instanceof Error ? error.name : 'UnknownError' }); }
}

async function auditForbidden(error: unknown, actor: MessagingActor, action: string, targetType: string, targetId: string) {
  if (!(error instanceof AppError) || error.statusCode !== 403) return;
  await recordAuditFailure({ actorUserId: actor.id, actorRole: actor.role, action, targetType, targetId, error: { code: '403', message: 'Messaging permission denied' } });
}

export async function listMessageContacts(actor: MessagingActor) {
  if (!MESSAGE_ROLES.includes(actor.role)) return { contacts: [] };
  let users: Array<{ _id: Types.ObjectId; name: string; email: string; role: Role }> = [];
  if (actor.role === 'ADMIN') {
    users = await UserModel.find({ role: { $in: ['MANAGER', 'EMPLOYEE'] }, isActive: true }).select('name email role').sort({ name: 1 }).limit(300).lean() as typeof users;
  } else if (actor.role === 'MANAGER') {
    const manager = await findEmployeeForUser(actor.id);
    if (manager) {
      const reports = await EmployeeModel.find({ managerId: manager._id, isActive: true }).select('userId').lean() as Array<{ userId: Types.ObjectId }>;
      users = await UserModel.find({ _id: { $in: reports.map((e) => e.userId) }, role: 'EMPLOYEE', isActive: true }).select('name email role').sort({ name: 1 }).lean() as typeof users;
    }
  } else {
    const employee = await findEmployeeForUser(actor.id);
    const manager = employee?.managerId ? await EmployeeModel.findById(employee.managerId).select('userId isActive').lean() as { userId: Types.ObjectId; isActive: boolean } | null : null;
    if (manager?.isActive) users = await UserModel.find({ _id: manager.userId, role: 'MANAGER', isActive: true }).select('name email role').lean() as typeof users;
  }
  return { contacts: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role })) };
}

export async function startConversation(actor: MessagingActor, recipientId: string) {
  let conversation;
  try { conversation = await getOrCreateConversation(actor, recipientId); }
  catch (error) { await auditForbidden(error, actor, 'MESSAGE_CONVERSATION_UNAUTHORIZED', 'User', recipientId); throw error; }
  if (!conversation) throw new AppError('Could not create conversation', 500);
  await writeAudit({ actorUserId: actor.id, actorRole: actor.role, action: 'MESSAGE_CONVERSATION_OPENED', targetType: 'Conversation', targetId: String(conversation._id), outcome: 'SUCCESS' });
  return { conversation };
}

export async function listConversations(actor: MessagingActor) {
  const conversations = await ConversationModel.find({ participants: actor.id }).sort({ latestMessageAt: -1, updatedAt: -1 }).limit(100).lean() as Array<{ _id: Types.ObjectId; participants: Types.ObjectId[]; latestMessageAt: Date | null; relatedTaskIds?: Types.ObjectId[] }>;
  const result = [];
  for (const conversation of conversations) {
    const otherId = conversation.participants.find((id) => String(id) !== actor.id);
    if (!otherId) continue;
    try {
      await assertCanMessage(actor, String(otherId), undefined, true);
    } catch {
      let permitted = false;
      for (const taskId of conversation.relatedTaskIds ?? []) {
        try { await assertCanMessage(actor, String(otherId), String(taskId), true); permitted = true; break; } catch { /* try other persisted task context */ }
      }
      if (!permitted) continue;
    }
    const [other, latest, unreadCount] = await Promise.all([
      UserModel.findById(otherId).select('name role isActive').lean() as Promise<{ name: string; role: Role; isActive: boolean } | null>,
      MessageModel.findOne({ conversationId: conversation._id }).sort({ createdAt: -1 }).select('body senderId createdAt').lean() as Promise<{ body: string; senderId: Types.ObjectId; createdAt: Date } | null>,
      MessageModel.countDocuments({ conversationId: conversation._id, recipientId: actor.id, readAt: null }),
    ]);
    if (other) result.push({ id: String(conversation._id), participant: { id: String(otherId), name: other.name, role: other.role, isActive: other.isActive }, latestMessage: latest, unreadCount });
  }
  return { conversations: result };
}

export async function listMessages(actor: MessagingActor, conversationId: string) {
  const { conversation } = await getConversationForActor(actor, conversationId);
  const messages = await MessageModel.find({ conversationId: conversation._id })
    .populate({ path: 'senderId', select: 'name role' })
    .populate({ path: 'recipientId', select: 'name role' })
    .populate({ path: 'relatedTaskId', select: 'title status dueDate' })
    .sort({ createdAt: 1 }).limit(500).lean();
  return { messages };
}

export async function sendMessage(actor: MessagingActor, conversationId: string, text: unknown, clientMessageId?: string, relatedTaskId?: string) {
  const body = sanitizeMessage(text);
  let conversation: { _id: Types.ObjectId; participants: Types.ObjectId[] };
  let recipientId: string;
  try {
    const access = await getConversationForActor(actor, conversationId);
    conversation = access.conversation;
    recipientId = access.recipientId;
    await assertCanMessage(actor, recipientId, relatedTaskId);
  } catch (error) {
    await auditForbidden(error, actor, 'MESSAGE_SEND_UNAUTHORIZED', 'Conversation', conversationId);
    throw error;
  }
  if (relatedTaskId) {
    validId(relatedTaskId, 'task id');
    const task = await TaskModel.findById(relatedTaskId).select('assignedTo projectId').lean() as { assignedTo: Types.ObjectId | null; projectId: Types.ObjectId } | null;
    if (!task) throw new AppError('Task not found', 404);
    const assignedEmployee = task.assignedTo ? await EmployeeModel.findById(task.assignedTo).select('userId').lean() as { userId: Types.ObjectId } | null : null;
    const project = await ProjectModel.findById(task.projectId).select('managerId members isActive').lean() as { managerId: Types.ObjectId; members: Types.ObjectId[]; isActive: boolean } | null;
    const hasTaskParticipant = Boolean(assignedEmployee && [actor.id, recipientId].includes(String(assignedEmployee.userId)));
    const actorManagesTask = actor.role === 'MANAGER' && String(project?.managerId) === actor.id;
    if (!hasTaskParticipant || (actor.role === 'MANAGER' && !actorManagesTask)) throw new AppError('Task is not related to this conversation', 403);
  }
  if (clientMessageId && !/^[A-Za-z0-9._:-]{1,100}$/.test(clientMessageId)) throw new AppError('Invalid message idempotency key', 400);
  if (clientMessageId) {
    const previous = await MessageModel.findOne({ senderId: actor.id, idempotencyKey: clientMessageId }).lean();
    if (previous) return { message: previous, notificationStatus: 'ALREADY_PROCESSED' };
  }
  const message = await MessageModel.create({ conversationId: conversation._id, senderId: actor.id, recipientId, body, relatedTaskId: relatedTaskId ?? null, kind: 'USER', idempotencyKey: clientMessageId ?? null });
  await ConversationModel.updateOne({ _id: conversation._id }, { $set: { latestMessageAt: message.createdAt } });
  const [sender] = await Promise.all([UserModel.findById(actor.id).select('name role').lean()]);
  const notification = await persistNotification({
    userId: recipientId, type: 'NEW_MESSAGE', title: `New message from ${sender?.name ?? 'FlowPilot user'}`,
    body: body.slice(0, 180), href: `/messages/${conversation._id}`, conversationId: String(conversation._id),
    taskId: relatedTaskId, messageId: String(message._id), dedupeKey: `message:${message._id}`,
  });
  await writeAudit({ actorUserId: actor.id, actorRole: actor.role, action: 'MESSAGE_SENT', targetType: 'Message', targetId: String(message._id), outcome: 'SUCCESS', after: { conversationId: conversation._id, recipientId } });
  return { message, notificationStatus: notification.inAppStatus };
}

export async function markConversationRead(actor: MessagingActor, conversationId: string) {
  const { conversation } = await getConversationForActor(actor, conversationId);
  await MessageModel.updateMany({ conversationId: conversation._id, recipientId: actor.id, readAt: null }, { $set: { readAt: new Date() } });
  await NotificationModel.updateMany({ userId: actor.id, conversationId: conversation._id, readAt: null }, { $set: { readAt: new Date() } });
  return { success: true };
}

export async function listNotifications(actor: MessagingActor) {
  const [notifications, unreadCount] = await Promise.all([
    NotificationModel.find({ userId: actor.id }).sort({ createdAt: -1 }).limit(50).lean(),
    NotificationModel.countDocuments({ userId: actor.id, readAt: null }),
  ]);
  return { notifications, unreadCount };
}

export async function markNotificationRead(actor: MessagingActor, id: string) {
  validId(id, 'notification id');
  const notification = await NotificationModel.findOneAndUpdate({ _id: id, userId: actor.id }, { $set: { readAt: new Date() } }, { new: true }).lean();
  if (!notification) throw new AppError('Notification not found', 404);
  return { notification };
}

type ReminderTaskContext = {
  _id: Types.ObjectId; title: string; status: string; dueDate: Date | null; assignedTo: Types.ObjectId | null;
  projectId: Types.ObjectId; assignedEmployee: Types.ObjectId | null; employeeUserId: Types.ObjectId | null;
  employeeName: string | null; employeeIsActive: boolean; managerEmployeeId: Types.ObjectId | null;
  managerUserId: Types.ObjectId | null; managerName: string | null; managerIsActive: boolean;
  projectManagerId: Types.ObjectId | null; projectManagerName: string | null; projectName: string;
};

async function reminderContext(taskId: string): Promise<ReminderTaskContext> {
  validId(taskId, 'task id');
  const task = await TaskModel.findById(taskId).select('title status dueDate assignedTo projectId').lean() as { _id: Types.ObjectId; title: string; status: string; dueDate: Date | null; assignedTo: Types.ObjectId | null; projectId: Types.ObjectId } | null;
  if (!task) throw new AppError('Task not found', 404);
  const [project, employee] = await Promise.all([
    ProjectModel.findById(task.projectId).select('name managerId').lean() as Promise<{ name: string; managerId: Types.ObjectId } | null>,
    task.assignedTo ? EmployeeModel.findById(task.assignedTo).select('userId employeeId managerId isActive').lean() as Promise<{ userId: Types.ObjectId; managerId: Types.ObjectId | null; isActive: boolean } | null> : null,
  ]);
  if (!project || !employee) throw new AppError('Task assignment relationship is unavailable', 409);
  const managerEmployee = employee.managerId ? await EmployeeModel.findById(employee.managerId).select('userId isActive').lean() as { userId: Types.ObjectId; isActive: boolean } | null : null;
  const [assignedUser, managerUser, projectManager] = await Promise.all([
    UserModel.findById(employee.userId).select('name isActive').lean() as Promise<{ name: string; isActive: boolean } | null>,
    managerEmployee?.isActive ? UserModel.findById(managerEmployee.userId).select('name isActive').lean() as Promise<{ name: string; isActive: boolean } | null> : null,
    UserModel.findById(project.managerId).select('name').lean() as Promise<{ name: string } | null>,
  ]);
  return {
    ...task,
    assignedEmployee: task.assignedTo,
    employeeUserId: employee.userId,
    employeeName: assignedUser?.name ?? null,
    employeeIsActive: employee.isActive && Boolean(assignedUser?.isActive),
    managerEmployeeId: employee.managerId,
    managerUserId: managerEmployee?.userId ?? null,
    managerName: managerUser?.name ?? null,
    managerIsActive: Boolean(managerEmployee?.isActive && managerUser?.isActive),
    projectManagerId: project.managerId,
    projectManagerName: projectManager?.name ?? null,
    projectName: project.name,
  };
}

async function assertCanSendReminder(actor: MessagingActor, task: ReminderTaskContext) {
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'MANAGER' || String(task.projectManagerId) !== actor.id) throw new AppError('Only an admin or the project manager can send task reminders', 403);
}

async function persistOverdueReminderNotifications(task: ReminderTaskContext, recipientIds: string[], dedupeKey: string, conversationId?: string, messageId?: string) {
  return Promise.all(recipientIds.map((userId) => {
    const isAssignedUser = userId === String(task.employeeUserId);
    return persistNotification({
      userId, type: 'OVERDUE_REMINDER', title: 'Overdue task reminder', body: `${task.title} is overdue.`,
      href: isAssignedUser && conversationId ? `/messages/${conversationId}` : `/tasks/${task._id}`,
      conversationId: isAssignedUser && conversationId ? conversationId : undefined,
      taskId: String(task._id), messageId: isAssignedUser ? messageId : undefined, dedupeKey,
    });
  }));
}

export async function getOverdueReminderPreview(actor: MessagingActor, taskId: string) {
  const task = await reminderContext(taskId);
  await assertCanSendReminder(actor, task);
  if (!task.dueDate || task.dueDate >= new Date() || task.status === 'COMPLETED') throw new AppError('Only overdue, incomplete tasks can be reminded', 409);
  if (!task.employeeIsActive) throw new AppError('The assigned employee is inactive', 409);
  return {
    task: { id: String(task._id), title: task.title, project: task.projectName, dueDate: task.dueDate },
    assignedEmployee: { id: String(task.employeeUserId), name: task.employeeName },
    manager: task.managerIsActive && task.managerUserId ? { id: String(task.managerUserId), name: task.managerName } : null,
    projectManager: { id: String(task.projectManagerId), name: task.projectManagerName },
  };
}

export async function sendOverdueReminder(actor: MessagingActor, taskId: string) {
  let stage = 'load_task_context';
  let task: ReminderTaskContext;
  try {
    task = await reminderContext(taskId);
    stage = 'validate_reminder_permission_and_eligibility';
    await assertCanSendReminder(actor, task);
    if (!task.dueDate || task.dueDate >= new Date() || task.status === 'COMPLETED') throw new AppError('Only overdue, incomplete tasks can be reminded', 409);
    if (!task.employeeIsActive) throw new AppError('The assigned employee is inactive', 409);
  } catch (error) {
    logger.warn('Overdue reminder preparation failed', safeFailureDiagnostics(stage, error));
    throw error;
  }
  const day = new Date().toISOString().slice(0, 10);
  const dedupeKey = `task:${taskId}:overdue-reminder:${day}`;
  const recipientIds = Array.from(new Set([String(task.employeeUserId), ...(task.managerIsActive && task.managerUserId ? [String(task.managerUserId)] : [])]));
  let reminder: { _id: Types.ObjectId; toObject?: () => Record<string, unknown> };
  stage = 'claim_reminder_deduplication';
  try {
    reminder = await OverdueReminderModel.create({ taskId, requestedBy: actor.id, dedupeKey, recipientStatuses: recipientIds.map((userId) => ({ userId, inAppStatus: 'PENDING', emailStatus: 'NOT_CONFIGURED' })) });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) {
      logger.warn('Overdue reminder deduplication claim failed', safeFailureDiagnostics(stage, error));
      throw error;
    }
    const existing = await OverdueReminderModel.findOne({ dedupeKey }).lean() as { _id: Types.ObjectId; messageId?: Types.ObjectId | null; recipientStatuses?: Array<{ inAppStatus: string }> } | null;
    if (!existing) throw error;
    if (existing.recipientStatuses?.length && existing.recipientStatuses.every((status) => status.inAppStatus === 'DELIVERED')) {
      return { duplicate: true, reminder: existing };
    }
    reminder = existing;
  }

  try {
    if (actor.id === String(task.employeeUserId)) {
      stage = 'persist_recipient_notifications';
      const outcomes = await persistOverdueReminderNotifications(task, recipientIds, dedupeKey);
      const recipientStatuses = recipientIds.map((userId, index) => ({ userId, ...outcomes[index] }));
      stage = 'persist_reminder_delivery_status';
      await OverdueReminderModel.updateOne({ _id: reminder._id }, { $set: { recipientStatuses } });
      stage = 'write_reminder_audit';
      await writeAudit({ actorUserId: actor.id, actorRole: actor.role, action: 'OVERDUE_TASK_REMINDER_SENT', targetType: 'Task', targetId: taskId, outcome: 'SUCCESS', after: { conversationId: null, recipients: recipientIds } });
      return { duplicate: false, reminder: { ...(reminder.toObject?.() ?? reminder), conversationId: null, messageId: null, recipientStatuses } };
    }

    stage = 'open_reminder_conversation';
    const conversation = await getOrCreateConversation(actor, String(task.employeeUserId), taskId);
    if (!conversation) throw new AppError('Could not open the reminder conversation', 500);
    const body = `Reminder: “${task.title}” in ${task.projectName} is overdue (due ${task.dueDate.toISOString().slice(0, 10)}). Please update the task or reply here.`;
    const existingMessageId = (reminder as { messageId?: Types.ObjectId | null }).messageId;
    let message: MessageDocument | null = existingMessageId ? await MessageModel.findById(existingMessageId).lean() as MessageDocument | null : null;
    if (!message) {
      stage = 'create_reminder_message';
      try {
        message = await MessageModel.create({ conversationId: conversation._id, senderId: actor.id, recipientId: task.employeeUserId, body: sanitizeMessage(body), relatedTaskId: task._id, kind: 'OVERDUE_REMINDER', idempotencyKey: `reminder:${dedupeKey}` }) as unknown as MessageDocument;
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        message = await MessageModel.findOne({ senderId: actor.id, idempotencyKey: `reminder:${dedupeKey}` }).lean() as MessageDocument | null;
        if (!message) throw error;
      }
      stage = 'persist_reminder_message_link';
      await OverdueReminderModel.updateOne({ _id: reminder._id }, { $set: { conversationId: conversation._id, messageId: message._id } });
    }
    stage = 'update_conversation';
    await ConversationModel.updateOne({ _id: conversation._id }, { $set: { latestMessageAt: message.createdAt } });
    stage = 'persist_recipient_notifications';
    const outcomes = await persistOverdueReminderNotifications(task, recipientIds, dedupeKey, String(conversation._id), String(message._id));
    const recipientStatuses = recipientIds.map((userId, index) => ({ userId, ...outcomes[index] }));
    stage = 'persist_reminder_delivery_status';
    await OverdueReminderModel.updateOne({ _id: reminder._id }, { $set: { conversationId: conversation._id, messageId: message._id, recipientStatuses } });
    stage = 'write_reminder_audit';
    await writeAudit({ actorUserId: actor.id, actorRole: actor.role, action: 'OVERDUE_TASK_REMINDER_SENT', targetType: 'Task', targetId: taskId, outcome: 'SUCCESS', after: { conversationId: conversation._id, recipients: recipientIds } });
    return { duplicate: false, reminder: { ...(reminder.toObject?.() ?? reminder), conversationId: conversation._id, messageId: message._id, recipientStatuses } };
  } catch (error) {
    logger.warn('Overdue reminder delivery failed', safeFailureDiagnostics(stage, error));
    await OverdueReminderModel.updateOne({ _id: reminder._id }, { $set: { recipientStatuses: recipientIds.map((userId) => ({ userId, inAppStatus: 'FAILED', emailStatus: 'NOT_CONFIGURED' })) } });
    await writeAudit({ actorUserId: actor.id, actorRole: actor.role, action: 'OVERDUE_TASK_REMINDER_FAILED', targetType: 'Task', targetId: taskId, outcome: 'FAILURE', error: { message: 'Reminder delivery failed' } });
    throw error;
  }
}
