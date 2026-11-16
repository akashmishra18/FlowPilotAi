import { Types } from 'mongoose';
import { listNotifications, sendMessage, sendOverdueReminder, startConversation } from '../../src/services/messagingService';
import { UserModel } from '../../src/models/User';
import { EmployeeModel } from '../../src/models/Employee';
import { NotificationModel } from '../../src/models/Notification';
import { TaskModel } from '../../src/models/Task';
import { ProjectModel } from '../../src/models/Project';
import { MessageModel } from '../../src/models/Message';
import { OverdueReminderModel } from '../../src/models/OverdueReminder';
import { ConversationModel } from '../../src/models/Conversation';
import { logger } from '../../src/utils/logger';
import { env } from '../../src/config/env';
import { sendResendEmail } from '../../src/integrations/email/resendEmailProvider';

jest.mock('../../src/models/User', () => ({ UserModel: { findById: jest.fn() } }));
jest.mock('../../src/models/Employee', () => ({ EmployeeModel: { findOne: jest.fn(), findById: jest.fn() } }));
jest.mock('../../src/models/Conversation', () => ({ ConversationModel: { findOneAndUpdate: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../../src/models/Message', () => ({ MessageModel: { create: jest.fn(), findById: jest.fn(), findOne: jest.fn() } }));
jest.mock('../../src/models/Notification', () => ({ NotificationModel: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../../src/models/Task', () => ({ TaskModel: { findById: jest.fn() } }));
jest.mock('../../src/models/Project', () => ({ ProjectModel: { findById: jest.fn(), exists: jest.fn() } }));
jest.mock('../../src/models/OverdueReminder', () => ({ OverdueReminderModel: { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../../src/services/auditService', () => ({ recordAuditEvent: jest.fn(), recordAuditFailure: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/config/env', () => ({ env: { corsOrigin: 'http://localhost:5173', email: { provider: 'mock', apiKey: '', fromAddress: '' } } }));
jest.mock('../../src/integrations/email/resendEmailProvider', () => ({ sendResendEmail: jest.fn() }));

const users = UserModel as jest.Mocked<typeof UserModel>;
const employees = EmployeeModel as jest.Mocked<typeof EmployeeModel>;
const notifications = NotificationModel as jest.Mocked<typeof NotificationModel>;
const tasks = TaskModel as jest.Mocked<typeof TaskModel>;
const projects = ProjectModel as jest.Mocked<typeof ProjectModel>;
const messages = MessageModel as jest.Mocked<typeof MessageModel>;
const reminders = OverdueReminderModel as jest.Mocked<typeof OverdueReminderModel>;
const conversations = ConversationModel as jest.Mocked<typeof ConversationModel>;
const resendEmail = sendResendEmail as jest.Mock;
const managerId = new Types.ObjectId();
const employeeId = new Types.ObjectId();

function employeeLookup(value: unknown) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

beforeEach(() => {
  jest.resetAllMocks();
  env.email.provider = 'mock';
  env.email.apiKey = '';
  env.email.fromAddress = '';
});

it('logs sanitized stage and database code when reminder task context loading fails', async () => {
  const taskId = new Types.ObjectId();
  const error = Object.assign(new Error('email private@example.com token=secret'), { name: 'MongoNetworkError', code: 'ECONNRESET' });
  tasks.findById.mockReturnValue({ select: jest.fn().mockImplementation(() => { throw error; }) } as never);

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'ADMIN' }, taskId.toString())).rejects.toBe(error);

  expect(logger.warn).toHaveBeenCalledWith('Overdue reminder preparation failed', {
    stage: 'load_task_context', errorType: 'MongoNetworkError', databaseErrorCode: 'ECONNRESET',
  });
  expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('private@example.com');
  expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('secret');
});

it('prevents a manager from starting a conversation with an unrelated employee', async () => {
  users.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: employeeId, role: 'EMPLOYEE', isActive: true }) }) } as never);
  employees.findOne
    .mockReturnValueOnce(employeeLookup({ _id: new Types.ObjectId(), userId: managerId, managerId: null, isActive: true }) as never)
    .mockReturnValueOnce(employeeLookup({ _id: new Types.ObjectId(), userId: employeeId, managerId: new Types.ObjectId(), isActive: true }) as never);

  await expect(startConversation({ id: managerId.toString(), role: 'MANAGER' }, employeeId.toString()))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('allows a manager to start a conversation with an active direct report', async () => {
  const managerEmployeeId = new Types.ObjectId();
  const employeeRecordId = new Types.ObjectId();
  users.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: employeeId, role: 'EMPLOYEE', isActive: true }) }) } as never);
  employees.findOne
    .mockReturnValueOnce(employeeLookup({ _id: managerEmployeeId, userId: managerId, managerId: null, isActive: true }) as never)
    .mockReturnValueOnce(employeeLookup({ _id: employeeRecordId, userId: employeeId, managerId: managerEmployeeId, isActive: true }) as never);
  const conversation = { _id: new Types.ObjectId(), participants: [managerId, employeeId] };
  conversations.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(conversation) } as never);

  const result = await startConversation({ id: managerId.toString(), role: 'MANAGER' }, employeeId.toString());

  expect(result.conversation).toEqual(conversation);
  expect(conversations.findOneAndUpdate).toHaveBeenCalledWith(
    { participantKey: [employeeId.toString(), managerId.toString()].sort().join(':') },
    expect.objectContaining({ $setOnInsert: expect.objectContaining({ participants: [managerId.toString(), employeeId.toString()] }) }),
    expect.objectContaining({ upsert: true, new: true }),
  );
});

function setupProjectScopedReminder(options: { managerProfile?: boolean; recipientActive?: boolean; assignedToTask?: boolean; projectOwned?: boolean; sameActorAssigned?: boolean; recipientRole?: string } = {}) {
  const taskId = new Types.ObjectId();
  const projectId = new Types.ObjectId();
  const employeeRecordId = new Types.ObjectId();
  const otherEmployeeRecordId = new Types.ObjectId();
  const recipientId = options.sameActorAssigned ? managerId : employeeId;
  const projectManagerId = managerId;
  tasks.findById.mockImplementation(() => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: taskId, title: 'Overdue task', status: 'TODO', dueDate: new Date('2020-01-01'),
      assignedTo: options.assignedToTask === false ? otherEmployeeRecordId : employeeRecordId, projectId,
    }) }),
  }) as never);
  projects.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Project', managerId: projectManagerId }) }) } as never);
  employees.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ userId: recipientId, employeeId: 'EMP-1', managerId: null, isActive: true }) }) } as never);
  employees.findOne.mockImplementation(((query: { userId?: unknown }) => employeeLookup(
    String(query.userId) === projectManagerId.toString()
      ? (options.managerProfile === false ? null : { _id: new Types.ObjectId(), userId: projectManagerId, managerId: null, isActive: true })
      : { _id: employeeRecordId, userId: recipientId, managerId: null, isActive: true },
  )) as never);
  users.findById.mockImplementation(((id: unknown) => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(
      String(id) === recipientId.toString()
        ? { _id: recipientId, name: 'Assigned user', email: 'assigned@example.test', role: options.recipientRole ?? 'EMPLOYEE', isActive: options.recipientActive !== false }
        : { _id: projectManagerId, name: 'Manager', role: 'MANAGER', isActive: true },
    ) }),
  })) as never);
  (projects as unknown as { exists: jest.Mock }).exists.mockResolvedValue(options.projectOwned !== false);
  reminders.create.mockResolvedValue({ _id: new Types.ObjectId(), toObject: () => ({ _id: new Types.ObjectId() }) } as never);
  conversations.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
  return { taskId, employeeRecordId, otherEmployeeRecordId, projectId, recipientId };
}

it('sends a task-linked notification without a conversation when the project manager is assigned the task', async () => {
  const { taskId, recipientId } = setupProjectScopedReminder({ sameActorAssigned: true, recipientRole: 'MANAGER' });
  notifications.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  notifications.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
  reminders.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);

  const result = await sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString());

  expect(result).toMatchObject({ duplicate: false, reminder: { conversationId: null, messageId: null, recipientStatuses: [{ userId: recipientId.toString(), inAppStatus: 'DELIVERED', emailStatus: 'NOT_CONFIGURED' }] } });
  expect(notifications.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId: recipientId.toString(), dedupeKey: expect.stringContaining(taskId.toString()) }), expect.objectContaining({ $setOnInsert: expect.objectContaining({ href: `/tasks/${taskId}`, taskId: taskId.toString(), conversationId: null, messageId: null }) }), { upsert: true });
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
  expect(messages.create).not.toHaveBeenCalled();
});

it('keeps conversation-based delivery when a different project manager reminds an employee', async () => {
  const { taskId } = setupProjectScopedReminder();
  const conversation = { _id: new Types.ObjectId(), participants: [managerId, employeeId] };
  const message = { _id: new Types.ObjectId(), createdAt: new Date(), conversationId: conversation._id };
  conversations.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(conversation) } as never);
  conversations.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  messages.create.mockResolvedValue(message as never);
  notifications.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  notifications.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
  reminders.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);

  const result = await sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString());

  expect(result).toMatchObject({ duplicate: false, reminder: { conversationId: conversation._id, messageId: message._id } });
  expect(conversations.findOneAndUpdate).toHaveBeenCalled();
  expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ conversationId: conversation._id, recipientId: employeeId, kind: 'OVERDUE_REMINDER' }));
  expect(notifications.updateOne).toHaveBeenCalledWith(expect.objectContaining({ userId: employeeId.toString() }), expect.objectContaining({ $setOnInsert: expect.objectContaining({ href: `/messages/${conversation._id}`, conversationId: conversation._id.toString(), messageId: message._id.toString() }) }), { upsert: true });
});

it('does not redeliver an already completed duplicate self-reminder', async () => {
  const { taskId } = setupProjectScopedReminder({ sameActorAssigned: true, recipientRole: 'MANAGER' });
  reminders.create.mockRejectedValue({ code: 11000 } as never);
  reminders.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), recipientStatuses: [{ inAppStatus: 'DELIVERED' }] }) } as never);

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString())).resolves.toMatchObject({ duplicate: true });

  expect(notifications.updateOne).not.toHaveBeenCalled();
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
  expect(messages.create).not.toHaveBeenCalled();
});

it('keeps the in-app self-reminder delivered when configured email delivery fails', async () => {
  const { taskId, recipientId } = setupProjectScopedReminder({ sameActorAssigned: true, recipientRole: 'MANAGER' });
  env.email.provider = 'resend';
  env.email.apiKey = 'mock-api-key';
  env.email.fromAddress = 'FlowPilot <no-reply@example.test>';
  resendEmail.mockResolvedValue('FAILED');
  notifications.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  notifications.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ emailStatus: 'PENDING' }) } as never);
  reminders.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);

  const result = await sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString());

  expect(resendEmail).toHaveBeenCalledTimes(1);
  expect(result.reminder.recipientStatuses).toEqual([{ userId: recipientId.toString(), inAppStatus: 'DELIVERED', emailStatus: 'FAILED' }]);
  expect(notifications.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({ userId: recipientId.toString() }), { $set: { emailStatus: 'FAILED' } });
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
  expect(messages.create).not.toHaveBeenCalled();
});

it('allows a project manager without an Employee profile to message the assigned active project member', async () => {
  const { taskId } = setupProjectScopedReminder({ managerProfile: false });

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString()))
    .rejects.toMatchObject({ statusCode: 500, message: 'Could not open the reminder conversation' });

  expect(projects.exists).toHaveBeenCalledWith(expect.objectContaining({ managerId: managerId.toString(), members: expect.any(Types.ObjectId), isActive: true }));
  expect(conversations.findOneAndUpdate).toHaveBeenCalled();
});

it('allows a project manager with an Employee profile when project scope is valid', async () => {
  const { taskId } = setupProjectScopedReminder();

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString()))
    .rejects.toMatchObject({ statusCode: 500, message: 'Could not open the reminder conversation' });

  expect(conversations.findOneAndUpdate).toHaveBeenCalled();
});

it('denies a manager outside the task project', async () => {
  const { taskId } = setupProjectScopedReminder({ managerProfile: false, projectOwned: false });

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString()))
    .rejects.toMatchObject({ statusCode: 403 });

  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
});

it('denies a reminder when the recipient is inactive', async () => {
  const { taskId } = setupProjectScopedReminder({ recipientActive: false });

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString()))
    .rejects.toMatchObject({ statusCode: 409 });
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
});

it('denies a manager when the recipient is not assigned to the relevant task', async () => {
  const { taskId } = setupProjectScopedReminder({ assignedToTask: false });

  await expect(sendOverdueReminder({ id: managerId.toString(), role: 'MANAGER' }, taskId.toString()))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(projects.exists).not.toHaveBeenCalled();
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
});

it('still requires a manager Employee profile for direct-report messaging', async () => {
  const { recipientId } = setupProjectScopedReminder({ managerProfile: false });

  await expect(startConversation({ id: managerId.toString(), role: 'MANAGER' }, recipientId.toString()))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(conversations.findOneAndUpdate).not.toHaveBeenCalled();
});

it('returns notifications filtered to the authenticated user only', async () => {
  const resultRows = [{ _id: new Types.ObjectId(), userId: employeeId }];
  notifications.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(resultRows) }) }) } as never);
  notifications.countDocuments.mockResolvedValue(1 as never);

  const result = await listNotifications({ id: employeeId.toString(), role: 'EMPLOYEE' });

  expect(notifications.find).toHaveBeenCalledWith({ userId: employeeId.toString() });
  expect(notifications.countDocuments).toHaveBeenCalledWith({ userId: employeeId.toString(), readAt: null });
  expect(result.unreadCount).toBe(1);
});

it('rejects empty/control-only message bodies before database access', async () => {
  await expect(sendMessage({ id: employeeId.toString(), role: 'EMPLOYEE' }, 'not-an-id', '\u0000\u0001  '))
    .rejects.toMatchObject({ statusCode: 400 });
});

it('does not create another reminder message when a task already has a reminder for today', async () => {
  const taskId = new Types.ObjectId();
  const employeeRecordId = new Types.ObjectId();
  const assigneeId = new Types.ObjectId();
  const projectManagerId = new Types.ObjectId();
  tasks.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({
    _id: taskId, title: 'Test overdue task', status: 'TODO', dueDate: new Date('2020-01-01'), assignedTo: employeeRecordId, projectId: new Types.ObjectId(),
  }) }) } as never);
  projects.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Demo project', managerId: projectManagerId }) }) } as never);
  employees.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ userId: assigneeId, managerId: null, isActive: true }) }) } as never);
  users.findById.mockImplementation(((id: unknown) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(String(id) === assigneeId.toString() ? { name: 'Assignee', role: 'EMPLOYEE', isActive: true } : { name: 'Manager', role: 'MANAGER' }) }) })) as never);
  reminders.create.mockRejectedValue({ code: 11000 } as never);
  reminders.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), dedupeKey: 'already-sent', recipientStatuses: [{ inAppStatus: 'DELIVERED' }] }) } as never);

  const result = await sendOverdueReminder({ id: new Types.ObjectId().toString(), role: 'ADMIN' }, taskId.toString());

  expect(result.duplicate).toBe(true);
  expect(messages.create).not.toHaveBeenCalled();
});

it('retries failed reminder delivery by reusing its persisted message', async () => {
  const taskId = new Types.ObjectId();
  const employeeRecordId = new Types.ObjectId();
  const assigneeId = new Types.ObjectId();
  const managerId = new Types.ObjectId();
  const reminderId = new Types.ObjectId();
  const messageId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();
  const message = { _id: messageId, createdAt: new Date(), conversationId };
  tasks.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({
    _id: taskId, title: 'Task needing retry', status: 'TODO', dueDate: new Date('2020-01-01'), assignedTo: employeeRecordId, projectId: new Types.ObjectId(),
  }) }) } as never);
  projects.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ name: 'Project', managerId }) }) } as never);
  employees.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ userId: assigneeId, managerId: null, isActive: true }) }) } as never);
  users.findById.mockImplementation(((id: unknown) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(String(id) === assigneeId.toString() ? { name: 'Assignee', role: 'EMPLOYEE', isActive: true } : { name: 'Manager', role: 'MANAGER' }) }) })) as never);
  reminders.create.mockRejectedValue({ code: 11000 } as never);
  reminders.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: reminderId, messageId, recipientStatuses: [{ inAppStatus: 'FAILED' }] }) } as never);
  messages.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(message) } as never);
  conversations.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: conversationId, participants: [managerId, assigneeId] }) } as never);
  conversations.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  notifications.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  reminders.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);

  const result = await sendOverdueReminder({ id: new Types.ObjectId().toString(), role: 'ADMIN' }, taskId.toString());

  expect(result.duplicate).toBe(false);
  expect(messages.findById).toHaveBeenCalledWith(messageId);
  expect(messages.create).not.toHaveBeenCalled();
  expect(notifications.updateOne).toHaveBeenCalledTimes(1);
});
