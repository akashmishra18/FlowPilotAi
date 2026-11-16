import { Types } from 'mongoose';
import { summarizeOverdueTasks, OverdueSummaryTask } from '../ai/summarizeOverdueTasks';
import { EmployeeModel } from '../models/Employee';
import { ProjectModel } from '../models/Project';
import { TaskModel } from '../models/Task';
import { UserModel } from '../models/User';
import { persistNotification, sendOverdueReminder } from './messagingService';
import { recordAuditEvent } from './auditService';
import { logger } from '../utils/logger';
import { safeFailureDiagnostics } from '../utils/safeFailureDiagnostics';

export type ScheduledWorkflow = 'overdue-reminders' | 'employee-daily-summary' | 'manager-weekly-summary' | 'admin-monthly-summary';

interface SummaryTaskRecord {
  title: string;
  dueDate: Date | null;
  status: string;
  projectId: { _id: Types.ObjectId; name: string; projectCode: string } | Types.ObjectId;
  assignedTo: { _id: Types.ObjectId; employeeId: string; userId: { name: string } | Types.ObjectId } | Types.ObjectId | null;
}

function taskPayload(records: SummaryTaskRecord[]): OverdueSummaryTask[] {
  return records.map((task) => {
    const project = task.projectId && 'name' in task.projectId ? task.projectId : null;
    const employee = task.assignedTo && 'employeeId' in task.assignedTo ? task.assignedTo : null;
    const user = employee?.userId && 'name' in employee.userId ? employee.userId : null;
    return {
      title: task.title,
      project: project ? { name: project.name, projectCode: project.projectCode } : null,
      assignedEmployee: employee ? { name: user?.name ?? null, employeeId: employee.employeeId } : null,
      dueDate: task.dueDate?.toISOString() ?? null,
      status: task.status,
    };
  });
}

const overdueFilter = (now: Date) => ({ dueDate: { $lt: now, $ne: null }, status: { $ne: 'COMPLETED' } });

export async function executeOverdueReminderSweep(now = new Date()): Promise<{ checked: number; delivered: number; failed: number }> {
  let tasks: Array<{ _id: Types.ObjectId; projectId: Types.ObjectId }>;
  try {
    tasks = await TaskModel.find({ ...overdueFilter(now), assignedTo: { $ne: null } }).select('_id projectId').lean() as Array<{ _id: Types.ObjectId; projectId: Types.ObjectId }>;
  } catch (error) {
    logger.warn('Scheduled overdue reminder sweep failed', safeFailureDiagnostics('load_overdue_tasks', error));
    throw error;
  }
  let delivered = 0;
  let failed = 0;
  for (const task of tasks) {
    let stage = 'load_project_manager';
    try {
      const project = await ProjectModel.findById(task.projectId).select('managerId').lean() as { managerId: Types.ObjectId } | null;
      if (!project?.managerId) throw new Error('Task project has no reporting manager');
      stage = 'send_task_reminder';
      const result = await sendOverdueReminder({ id: String(project.managerId), role: 'MANAGER' }, String(task._id));
      if (!result.duplicate) delivered += 1;
    } catch (error) {
      failed += 1;
      logger.warn('Scheduled overdue reminder failed', safeFailureDiagnostics(stage, error));
    }
  }
  if (failed) throw new Error(`Reminder sweep failed for ${failed} of ${tasks.length} tasks`);
  return { checked: tasks.length, delivered, failed };
}

async function notifySummary(input: { userId: Types.ObjectId; role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN'; scope: Record<string, unknown>; jobKey: ScheduledWorkflow; periodKey: string; now: Date }) {
  const records = await TaskModel.find({ ...overdueFilter(input.now), ...input.scope })
    .populate({ path: 'projectId', select: 'name projectCode' })
    .populate({ path: 'assignedTo', select: 'employeeId userId', populate: { path: 'userId', select: 'name' } })
    .sort({ dueDate: 1 }).limit(500).lean() as unknown as SummaryTaskRecord[];
  const tasks = taskPayload(records);
  const requestId = `scheduled:${input.jobKey}:${input.periodKey}:${String(input.userId)}`;
  const result = await summarizeOverdueTasks(tasks, undefined, { userId: String(input.userId), requestId });
  const label = result.summarySource === 'AI' ? 'AI-generated' : 'Rule-based';
  const scopeLabel = input.role === 'EMPLOYEE' ? 'daily overdue work summary' : input.role === 'MANAGER' ? 'weekly team overdue summary' : 'monthly organization overdue summary';
  const delivery = await persistNotification({
    userId: String(input.userId), type: 'SCHEDULED_SUMMARY', title: `${label} ${scopeLabel}`,
    body: `${result.summarySource === 'AI' ? 'AI-generated' : 'Rule-based'}: ${result.summary}`.slice(0, 300),
    href: '/ai-agent', dedupeKey: `summary:${input.jobKey}:${input.periodKey}:${String(input.userId)}`,
  });
  if (delivery.inAppStatus !== 'DELIVERED') throw new Error(`Scheduled summary notification failed for ${input.role}`);
  return { recipients: 1, tasks: tasks.length, aiGenerated: result.summarySource === 'AI' ? 1 : 0, ruleBased: result.summarySource === 'RULE_BASED' ? 1 : 0 };
}

export async function executeScheduledSummary(workflow: Exclude<ScheduledWorkflow, 'overdue-reminders'>, periodKey: string, now = new Date()) {
  let recipients: Array<{ _id: Types.ObjectId }>;
  let scopes: Array<Record<string, unknown>>;
  let role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  if (workflow === 'employee-daily-summary') {
    role = 'EMPLOYEE';
    const employees = await EmployeeModel.find({ isActive: true }).select('_id userId').lean() as Array<{ _id: Types.ObjectId; userId: Types.ObjectId }>;
    const users = await UserModel.find({ _id: { $in: employees.map((e) => e.userId) }, role: 'EMPLOYEE', isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>;
    recipients = users;
    const employeeByUser = new Map(employees.map((e) => [String(e.userId), String(e._id)]));
    scopes = users.map((user) => ({ assignedTo: new Types.ObjectId(employeeByUser.get(String(user._id))!) }));
  } else if (workflow === 'manager-weekly-summary') {
    role = 'MANAGER';
    recipients = await UserModel.find({ role: 'MANAGER', isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>;
    scopes = await Promise.all(recipients.map(async (user) => {
      const projects = await ProjectModel.find({ managerId: user._id, isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>;
      return { projectId: { $in: projects.map((project) => project._id) } };
    }));
  } else {
    role = 'ADMIN';
    recipients = await UserModel.find({ role: 'ADMIN', isActive: true }).select('_id').lean() as Array<{ _id: Types.ObjectId }>;
    scopes = recipients.map(() => ({}));
  }

  let recipientsNotified = 0;
  let taskTotal = 0;
  let aiGenerated = 0;
  let ruleBased = 0;
  for (let index = 0; index < recipients.length; index += 1) {
    const result = await notifySummary({ userId: recipients[index]._id, role, scope: scopes[index], jobKey: workflow, periodKey, now });
    recipientsNotified += result.recipients;
    taskTotal += result.tasks;
    aiGenerated += result.aiGenerated;
    ruleBased += result.ruleBased;
  }
  return { recipients: recipientsNotified, tasks: taskTotal, aiGenerated, ruleBased };
}

export async function recordScheduledWorkflowAudit(jobKey: string, periodKey: string, outcome: 'SUCCESS' | 'FAILURE', stats?: Record<string, number>, error?: string) {
  try {
    await recordAuditEvent({
      action: `SCHEDULED_${jobKey.replace(/-/g, '_').toUpperCase()}`,
      targetType: 'ScheduledWorkflow', targetId: `${jobKey}:${periodKey}`, outcome,
      after: stats, error: error ? { message: error.slice(0, 300) } : null,
    });
  } catch (auditError) {
    logger.error('Scheduled workflow audit persistence failed', { jobKey, periodKey, errorType: auditError instanceof Error ? auditError.name : 'UnknownError' });
  }
}
