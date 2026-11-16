jest.mock('../../src/models/ScheduledJobRun', () => ({ ScheduledJobRunModel: { create: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../../src/services/scheduledWorkflowService', () => ({
  executeOverdueReminderSweep: jest.fn().mockResolvedValue({ checked: 3, delivered: 3, failed: 0 }),
  executeScheduledSummary: jest.fn(),
  recordScheduledWorkflowAudit: jest.fn().mockResolvedValue(undefined),
}));

import { ScheduledJobRunModel } from '../../src/models/ScheduledJobRun';
import { executeOverdueReminderSweep, recordScheduledWorkflowAudit } from '../../src/services/scheduledWorkflowService';
import { dueWorkflows, periodKey, runDueWorkflows } from '../../src/jobs/scheduledWorkflows';

const runModel = ScheduledJobRunModel as unknown as { create: jest.Mock; findOneAndUpdate: jest.Mock; updateOne: jest.Mock };
const sweep = executeOverdueReminderSweep as jest.Mock;
const audit = recordScheduledWorkflowAudit as jest.Mock;

describe('scheduled workflows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses Asia/Kolkata periods and runs daily summaries after their scheduled time', () => {
    const daily = new Date('2026-11-13T03:06:00.000Z'); // 08:36 IST
    const afterDaily = new Date('2026-11-13T03:36:00.000Z'); // 09:06 IST
    expect(dueWorkflows(daily)).toEqual([]);
    expect(dueWorkflows(afterDaily)).toEqual(['overdue-reminders', 'employee-daily-summary']);
    expect(periodKey('employee-daily-summary', afterDaily)).toBe('2026-11-13');
  });

  it('schedules manager and admin summaries weekly and monthly', () => {
    const monday = new Date('2026-11-16T03:42:00.000Z'); // Monday 09:12 IST
    const firstOfMonth = new Date('2026-12-01T03:46:00.000Z');
    expect(dueWorkflows(monday)).toContain('manager-weekly-summary');
    expect(periodKey('manager-weekly-summary', monday)).toBe('2026-11-16');
    expect(dueWorkflows(firstOfMonth)).toContain('admin-monthly-summary');
    expect(periodKey('admin-monthly-summary', firstOfMonth)).toBe('2026-12');
  });

  it('records successful runs and does not execute the same claimed period twice', async () => {
    const now = new Date('2026-11-13T03:30:00.000Z');
    runModel.create.mockResolvedValueOnce({});
    runModel.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    await runDueWorkflows(now);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(runModel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ jobKey: 'overdue-reminders', periodKey: '2026-11-13' }), expect.objectContaining({ $set: expect.objectContaining({ status: 'SUCCEEDED' }) }));
    expect(audit).toHaveBeenCalledWith('overdue-reminders', '2026-11-13', 'SUCCESS', { checked: 3, delivered: 3, failed: 0 });

    runModel.create.mockRejectedValueOnce({ code: 11000 });
    runModel.findOneAndUpdate.mockResolvedValueOnce(null);
    await runDueWorkflows(now);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it('marks failed work retryable and records a failure audit', async () => {
    const now = new Date('2026-11-13T03:30:00.000Z');
    runModel.create.mockResolvedValueOnce({});
    sweep.mockRejectedValueOnce(new Error('delivery failure'));
    runModel.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
    await runDueWorkflows(now);
    expect(runModel.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED', error: 'Scheduled workflow failed (Error)' }) }));
    expect(audit).toHaveBeenCalledWith('overdue-reminders', '2026-11-13', 'FAILURE', undefined, 'Scheduled workflow failed (Error)');
  });
});
