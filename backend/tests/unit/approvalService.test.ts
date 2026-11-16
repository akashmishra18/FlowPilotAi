jest.mock('../../src/models/TaskReassignmentApproval');
jest.mock('../../src/models/Project');
jest.mock('../../src/models/Task');
jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');
jest.mock('../../src/services/taskService');
jest.mock('../../src/services/auditService');
jest.mock('../../src/services/messagingService', () => ({ persistNotification: jest.fn().mockResolvedValue({ inAppStatus: 'DELIVERED', emailStatus: 'NOT_CONFIGURED' }) }));

import { TaskReassignmentApprovalModel } from '../../src/models/TaskReassignmentApproval';
import { ProjectModel } from '../../src/models/Project';
import { TaskModel } from '../../src/models/Task';
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';
import { persistNotification } from '../../src/services/messagingService';
import * as taskService from '../../src/services/taskService';
import * as auditService from '../../src/services/auditService';
import * as approvalService from '../../src/services/approvalService';
import { Types } from 'mongoose';

const approvals = TaskReassignmentApprovalModel as jest.Mocked<typeof TaskReassignmentApprovalModel>;
const projects = ProjectModel as jest.Mocked<typeof ProjectModel>;
const tasks = taskService as jest.Mocked<typeof taskService>;
const audit = auditService as jest.Mocked<typeof auditService>;

const admin = { id: new Types.ObjectId().toString(), role: 'ADMIN' as const };
const manager = { id: new Types.ObjectId().toString(), role: 'MANAGER' as const };
const employee = { id: new Types.ObjectId().toString(), role: 'EMPLOYEE' as const };
const requestId = new Types.ObjectId().toString();
const taskId = new Types.ObjectId().toString();
const projectId = new Types.ObjectId().toString();
const fromId = new Types.ObjectId().toString();
const targetId = new Types.ObjectId().toString();

const request = {
  _id: new Types.ObjectId(requestId), taskId: new Types.ObjectId(taskId), projectId: new Types.ObjectId(projectId),
  assignedTo: new Types.ObjectId(targetId), fromAssignedTo: new Types.ObjectId(fromId), status: 'PENDING',
  executionAttemptId: null,
  toObject: () => ({ _id: requestId, status: 'EXECUTING' }),
};

function query(value: unknown) {
  return { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(value) } as never;
}

beforeEach(() => {
  jest.resetAllMocks();
  approvals.findById.mockReturnValue(query(request) as never);
  approvals.findOneAndUpdate.mockResolvedValue(request as never);
  approvals.updateOne.mockResolvedValue({ modifiedCount: 1 } as never);
  tasks.assignTask.mockResolvedValue({ _id: taskId } as never);
  projects.findById.mockReturnValue(query({ managerId: manager.id }) as never);
  (TaskModel.findById as jest.Mock).mockReturnValue(query({ title: 'Test task' }));
  (EmployeeModel.findById as jest.Mock).mockReturnValue(query({ userId: new Types.ObjectId() }));
  (UserModel.findById as jest.Mock).mockReturnValue(query({ name: 'Requester' }));
  (UserModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
});

describe('approvalService.createTaskReassignmentRequest', () => {
  it('persists an authorized request and records it in audit', async () => {
    tasks.validateReassignmentRequest.mockResolvedValue({
      taskId: new Types.ObjectId(taskId), projectId: new Types.ObjectId(projectId),
      fromAssignedTo: new Types.ObjectId(fromId), assignedTo: new Types.ObjectId(targetId),
    } as never);
    approvals.create.mockResolvedValue(request as never);

    await approvalService.createTaskReassignmentRequest(employee, taskId, targetId);

    expect(approvals.create).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: employee.id, requesterRole: 'EMPLOYEE', status: 'PENDING' }));
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_REQUESTED', outcome: 'SUCCESS' }));
    expect(persistNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'APPROVAL_UPDATE', title: 'Task reassignment needs review', body: expect.stringContaining('Test task'), href: `/approvals?request=${requestId}` }));
  });
});

describe('approvalService.approveTaskReassignment', () => {
  it('claims once and executes via taskService.assignTask', async () => {
    await approvalService.approveTaskReassignment(admin, requestId);

    expect(approvals.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: requestId, status: 'PENDING' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'EXECUTING' }) }),
      { new: true },
    );
    expect(tasks.assignTask).toHaveBeenCalledWith(admin, taskId, targetId, fromId);
    expect(approvals.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: requestId, status: 'EXECUTING', executionAttemptId: expect.any(String) }), { $set: { status: 'APPROVED', executionError: null } });
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_EXECUTED', outcome: 'SUCCESS' }));
  });

  it('rejects unauthorized roles before an execution claim', async () => {
    await expect(approvalService.approveTaskReassignment(employee, requestId)).rejects.toMatchObject({ statusCode: 403 });
    expect(approvals.findOneAndUpdate).not.toHaveBeenCalled();
    expect(tasks.assignTask).not.toHaveBeenCalled();
  });

  it('does not execute when another approval already claimed the request', async () => {
    approvals.findOneAndUpdate.mockResolvedValueOnce(null as never);
    await expect(approvalService.approveTaskReassignment(admin, requestId)).rejects.toMatchObject({ statusCode: 409 });
    expect(tasks.assignTask).not.toHaveBeenCalled();
    expect(audit.recordAuditFailure).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_APPROVAL_DUPLICATE' }));
  });

  it('reclaims an interrupted EXECUTING request with a compare-and-set claim', async () => {
    approvals.findById.mockReturnValueOnce(query({ ...request, status: 'EXECUTING', executionAttemptId: 'stale-attempt' }) as never);
    await approvalService.approveTaskReassignment(admin, requestId);

    expect(approvals.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: requestId, status: 'EXECUTING', executionAttemptId: 'stale-attempt' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'EXECUTING', executionAttemptId: expect.any(String) }) }),
      { new: true },
    );
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_EXECUTION_RETRY' }));
    expect(tasks.assignTask).toHaveBeenCalledWith(admin, taskId, targetId, fromId);
  });

  it('never retries an already approved request', async () => {
    approvals.findById.mockReturnValueOnce(query({ ...request, status: 'APPROVED' }) as never);
    await expect(approvalService.approveTaskReassignment(admin, requestId)).rejects.toMatchObject({ statusCode: 409 });
    expect(approvals.findOneAndUpdate).not.toHaveBeenCalled();
    expect(tasks.assignTask).not.toHaveBeenCalled();
  });

  it('marks execution failures and emits a failure audit event', async () => {
    tasks.assignTask.mockRejectedValueOnce(new Error('Assignment failed'));
    await expect(approvalService.approveTaskReassignment(admin, requestId)).rejects.toThrow('Assignment failed');
    expect(approvals.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: requestId, status: 'EXECUTING', executionAttemptId: expect.any(String) }), { $set: { status: 'FAILED', executionError: 'Task reassignment failed. Contact an administrator.' } });
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_EXECUTION_FAILED', outcome: 'FAILURE' }));
  });
});

describe('approvalService.rejectTaskReassignment', () => {
  it('records rejection without calling the task service', async () => {
    approvals.findOneAndUpdate.mockResolvedValueOnce({ ...request, status: 'REJECTED' } as never);
    await approvalService.rejectTaskReassignment(manager, requestId);
    expect(tasks.assignTask).not.toHaveBeenCalled();
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_REASSIGNMENT_REJECTED', outcome: 'SUCCESS' }));
  });

  it('prevents managers from reviewing requests outside their project scope', async () => {
    projects.findById.mockReturnValueOnce(query({ managerId: new Types.ObjectId().toString() }) as never);
    await expect(approvalService.rejectTaskReassignment(manager, requestId)).rejects.toMatchObject({ statusCode: 403 });
    expect(approvals.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
