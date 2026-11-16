import cron from 'node-cron';
import { ScheduledJobRunModel } from '../models/ScheduledJobRun';
import { executeOverdueReminderSweep, executeScheduledSummary, recordScheduledWorkflowAudit, ScheduledWorkflow } from '../services/scheduledWorkflowService';
import { logger } from '../utils/logger';

const TIME_ZONE = 'Asia/Kolkata';
const LEASE_MS = 30 * 60 * 1000;
type SummaryJob = Exclude<ScheduledWorkflow, 'overdue-reminders'>;

function zonedParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
}

export function periodKey(job: ScheduledWorkflow, now: Date): string {
  const parts = zonedParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (job === 'admin-monthly-summary') return `${parts.year}-${parts.month}`;
  if (job === 'manager-weekly-summary') {
    const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    const weekday = localDate.getUTCDay() || 7;
    localDate.setUTCDate(localDate.getUTCDate() - weekday + 1);
    return localDate.toISOString().slice(0, 10);
  }
  return date;
}

export function dueWorkflows(now: Date): ScheduledWorkflow[] {
  const parts = zonedParts(now);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const jobs: ScheduledWorkflow[] = [];
  if (hour > 9 || (hour === 9 && minute >= 0)) jobs.push('overdue-reminders');
  if (hour > 9 || (hour === 9 && minute >= 5)) jobs.push('employee-daily-summary');
  if (parts.weekday === 'Mon' && (hour > 9 || (hour === 9 && minute >= 10))) jobs.push('manager-weekly-summary');
  if (parts.day === '01' && (hour > 9 || (hour === 9 && minute >= 15))) jobs.push('admin-monthly-summary');
  return jobs;
}

async function claim(jobKey: ScheduledWorkflow, currentPeriod: string, now: Date): Promise<boolean> {
  try {
    await ScheduledJobRunModel.create({ jobKey, periodKey: currentPeriod, status: 'RUNNING', attempts: 1, startedAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS) });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const reclaimed = await ScheduledJobRunModel.findOneAndUpdate(
    { jobKey, periodKey: currentPeriod, $or: [{ status: 'FAILED' }, { status: 'RUNNING', leaseUntil: { $lt: now } }] },
    { $set: { status: 'RUNNING', startedAt: now, finishedAt: null, leaseUntil: new Date(now.getTime() + LEASE_MS), error: null, result: null }, $inc: { attempts: 1 } },
    { new: true },
  );
  return Boolean(reclaimed);
}

export async function runDueWorkflows(now = new Date()): Promise<void> {
  for (const job of dueWorkflows(now)) {
    const key = periodKey(job, now);
    let claimed: boolean;
    try { claimed = await claim(job, key, now); }
    catch (error) {
      logger.error('Scheduled workflow claim failed', { jobKey: job, periodKey: key, errorType: error instanceof Error ? error.name : 'UnknownError' });
      continue;
    }
    if (!claimed) continue;
    try {
      const result = job === 'overdue-reminders'
        ? await executeOverdueReminderSweep(now)
        : await executeScheduledSummary(job as SummaryJob, key, now);
      await ScheduledJobRunModel.updateOne({ jobKey: job, periodKey: key, status: 'RUNNING' }, { $set: { status: 'SUCCEEDED', finishedAt: new Date(), result } });
      await recordScheduledWorkflowAudit(job, key, 'SUCCESS', result);
      logger.info('Scheduled workflow completed', { jobKey: job, periodKey: key, ...result });
    } catch (error) {
      const safeError = `Scheduled workflow failed (${error instanceof Error ? error.name : 'UnknownError'})`;
      await ScheduledJobRunModel.updateOne({ jobKey: job, periodKey: key, status: 'RUNNING' }, { $set: { status: 'FAILED', finishedAt: new Date(), error: safeError } });
      await recordScheduledWorkflowAudit(job, key, 'FAILURE', undefined, safeError);
      logger.error('Scheduled workflow failed', { jobKey: job, periodKey: key, errorType: error instanceof Error ? error.name : 'UnknownError' });
    }
  }
}

/** Call only after MongoDB connects; the unique database claim coordinates all app instances. */
export async function startScheduledWorkflows() {
  await ScheduledJobRunModel.createIndexes();
  const task = cron.schedule('*/5 * * * *', () => { void runDueWorkflows(); }, { timezone: TIME_ZONE });
  void runDueWorkflows();
  logger.info('Scheduled workflows started', { timezone: TIME_ZONE, interval: '5 minutes' });
  return () => task.stop();
}
