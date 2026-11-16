jest.mock('../../src/models/ClientIssue', () => ({ ClientIssueModel: { find: jest.fn(), create: jest.fn(), findById: jest.fn() } }));
jest.mock('../../src/models/Employee', () => ({ EmployeeModel: { findOne: jest.fn(), find: jest.fn() } }));
jest.mock('../../src/models/Project', () => ({ ProjectModel: { find: jest.fn(), findById: jest.fn(), exists: jest.fn() } }));
jest.mock('../../src/models/Task', () => ({ TaskModel: { findById: jest.fn() } }));
jest.mock('../../src/models/User', () => ({ UserModel: { find: jest.fn() } }));
jest.mock('../../src/services/auditService', () => ({ recordAuditEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/messagingService', () => ({ persistNotification: jest.fn().mockResolvedValue({ inAppStatus: 'DELIVERED' }) }));

import { createClientIssue, listClientIssues, updateClientIssue } from '../../src/services/clientIssueService';
import { ClientIssueModel } from '../../src/models/ClientIssue';
import { ProjectModel } from '../../src/models/Project';
import { EmployeeModel } from '../../src/models/Employee';

const issues = ClientIssueModel as unknown as { create: jest.Mock; find: jest.Mock; findById: jest.Mock };
const projects = ProjectModel as unknown as { find: jest.Mock };
const employees = EmployeeModel as unknown as { findOne: jest.Mock };
const manager = { id: '64b000000000000000000001', role: 'MANAGER' as const };

beforeEach(() => jest.clearAllMocks());

it('refuses manager issue creation for a project outside their scope', async () => {
  projects.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: '64b000000000000000000002' }]) }) });
  await expect(createClientIssue(manager, { clientName: 'Client', message: 'Issue', projectId: '64b000000000000000000003' })).rejects.toThrow(/outside your permitted scope/);
  expect(issues.create).not.toHaveBeenCalled();
});

it('limits employee queue to permitted project issues and their own unlinked entries', async () => {
  employees.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: '64b000000000000000000004' }) }) });
  projects.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: '64b000000000000000000005' }]) }) });
  const query = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
  issues.find.mockReturnValue(query);
  await listClientIssues({ id: '64b000000000000000000001', role: 'EMPLOYEE' });
  expect(issues.find).toHaveBeenCalledWith({ $or: [
    { projectId: { $in: ['64b000000000000000000005'] } },
    { createdBy: '64b000000000000000000001' },
  ] });
});

it('prevents employees from changing issue assignments or status', async () => {
  await expect(updateClientIssue({ id: '64b000000000000000000001', role: 'EMPLOYEE' }, '64b000000000000000000006', { status: 'RESOLVED' })).rejects.toThrow(/Only an admin or manager/);
  expect(issues.findById).not.toHaveBeenCalled();
});
