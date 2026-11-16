jest.mock('../../src/models/Employee', () => ({ EmployeeModel: { find: jest.fn() } }));
jest.mock('../../src/models/Project', () => ({ ProjectModel: { find: jest.fn(), findById: jest.fn() } }));
jest.mock('../../src/models/Task', () => ({ TaskModel: { find: jest.fn() } }));
jest.mock('../../src/models/User', () => ({ UserModel: { find: jest.fn() } }));
jest.mock('../../src/services/messagingService', () => ({ persistNotification: jest.fn().mockResolvedValue({ inAppStatus: 'DELIVERED' }), sendOverdueReminder: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ recordAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/ai/summarizeOverdueTasks', () => ({ summarizeOverdueTasks: jest.fn().mockResolvedValue({ summary: 'Two overdue tasks need attention.', summarySource: 'RULE_BASED', fallbackReason: 'provider_unconfigured' }) }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import { Types } from 'mongoose';
import { EmployeeModel } from '../../src/models/Employee';
import { ProjectModel } from '../../src/models/Project';
import { TaskModel } from '../../src/models/Task';
import { UserModel } from '../../src/models/User';
import { persistNotification } from '../../src/services/messagingService';
import { summarizeOverdueTasks } from '../../src/ai/summarizeOverdueTasks';
import { executeOverdueReminderSweep, executeScheduledSummary } from '../../src/services/scheduledWorkflowService';
import { sendOverdueReminder } from '../../src/services/messagingService';
import { logger } from '../../src/utils/logger';

const employees = EmployeeModel as unknown as { find: jest.Mock };
const projects = ProjectModel as unknown as { find: jest.Mock; findById: jest.Mock };
const tasks = TaskModel as unknown as { find: jest.Mock };
const users = UserModel as unknown as { find: jest.Mock };
const notification = persistNotification as jest.Mock;
const summarize = summarizeOverdueTasks as jest.Mock;
const sendReminder = sendOverdueReminder as jest.Mock;

function queryResult(value: unknown) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(value) };
}
function taskQuery(value: unknown) {
  const query = {
    populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(value),
  };
  return query;
}

describe('scheduled summary scoping and fallback labels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('limits employee summaries to their own active employee record and labels fallback', async () => {
    const userId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    users.find.mockReturnValue(queryResult([{ _id: userId }]));
    employees.find.mockReturnValue(queryResult([{ _id: employeeId, userId }]));
    const taskQueryValue = taskQuery([]);
    tasks.find.mockReturnValue(taskQueryValue);
    const now = new Date('2026-11-13T04:00:00Z');

    const result = await executeScheduledSummary('employee-daily-summary', '2026-11-13', now);

    expect(tasks.find).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: employeeId, status: { $ne: 'COMPLETED' } }));
    expect(notification).toHaveBeenCalledWith(expect.objectContaining({ userId: String(userId), type: 'SCHEDULED_SUMMARY', title: expect.stringContaining('Rule-based'), body: expect.stringContaining('Rule-based:') }));
    expect(result).toEqual({ recipients: 1, tasks: 0, aiGenerated: 0, ruleBased: 1 });
  });

  it('limits manager summaries to projects managed by each manager', async () => {
    const managerId = new Types.ObjectId();
    const projectId = new Types.ObjectId();
    users.find.mockReturnValue(queryResult([{ _id: managerId }]));
    projects.find.mockReturnValue(queryResult([{ _id: projectId }]));
    tasks.find.mockReturnValue(taskQuery([]));
    await executeScheduledSummary('manager-weekly-summary', '2026-11-09', new Date('2026-11-13T04:00:00Z'));
    expect(projects.find).toHaveBeenCalledWith({ managerId, isActive: true });
    expect(tasks.find).toHaveBeenCalledWith(expect.objectContaining({ projectId: { $in: [projectId] } }));
  });

  it('uses organization scope only for active admins', async () => {
    const adminId = new Types.ObjectId();
    users.find.mockReturnValue(queryResult([{ _id: adminId }]));
    tasks.find.mockReturnValue(taskQuery([]));
    await executeScheduledSummary('admin-monthly-summary', '2026-11', new Date('2026-11-13T04:00:00Z'));
    expect(users.find).toHaveBeenCalledWith({ role: 'ADMIN', isActive: true });
    expect(tasks.find).toHaveBeenCalledWith(expect.objectContaining({ dueDate: expect.any(Object), status: { $ne: 'COMPLETED' } }));
    expect(summarize).toHaveBeenCalledWith([], undefined, expect.objectContaining({ userId: String(adminId) }));
  });
});

describe('overdue reminder diagnostics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs stage and sanitized database code for an individual reminder failure', async () => {
    const taskId = new Types.ObjectId();
    tasks.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: taskId, projectId: new Types.ObjectId() }]) }) });
    projects.findById.mockReturnValue(queryResult({ managerId: new Types.ObjectId() }));
    sendReminder.mockRejectedValue(Object.assign(new Error('recipient@example.com token=secret'), { name: 'MongoServerError', code: 11000 }));

    await expect(executeOverdueReminderSweep()).rejects.toThrow('Reminder sweep failed for 1 of 1 tasks');

    expect(logger.warn).toHaveBeenCalledWith('Scheduled overdue reminder failed', {
      stage: 'send_task_reminder', errorType: 'MongoServerError', databaseErrorCode: 11000,
    });
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('recipient@example.com');
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain('secret');
  });

  it('logs the task-scan stage and safe error class when the initial query fails', async () => {
    tasks.find.mockImplementation(() => { throw Object.assign(new Error('private details'), { name: 'MongoNetworkError', code: 'ECONNRESET' }); });

    await expect(executeOverdueReminderSweep()).rejects.toMatchObject({ name: 'MongoNetworkError' });
    expect(logger.warn).toHaveBeenCalledWith('Scheduled overdue reminder sweep failed', {
      stage: 'load_overdue_tasks', errorType: 'MongoNetworkError', databaseErrorCode: 'ECONNRESET',
    });
  });
});
