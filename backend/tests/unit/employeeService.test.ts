import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');
jest.mock('../../src/models/Project');
jest.mock('../../src/models/Task');
jest.mock('../../src/services/auditService');

// Imported after the mocks so the mocked versions are what get wired in.
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';
import { ProjectModel } from '../../src/models/Project';
import { TaskModel } from '../../src/models/Task';
import * as employeeService from '../../src/services/employeeService';
import * as auditService from '../../src/services/auditService';

const mockedEmployeeModel = EmployeeModel as jest.Mocked<typeof EmployeeModel>;
const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;
const mockedProjectModel = ProjectModel as jest.Mocked<typeof ProjectModel>;
const mockedTaskModel = TaskModel as jest.Mocked<typeof TaskModel>;
const mockedAudit = auditService as jest.Mocked<typeof auditService>;

const validUserId = new Types.ObjectId().toString();
const validEmployeeId = new Types.ObjectId().toString();
const adminRequester = { id: new Types.ObjectId().toString(), role: 'ADMIN' as const };
const managerUserId = new Types.ObjectId().toString();
const managerEmployeeId = new Types.ObjectId();
const managerRequester = { id: managerUserId, role: 'MANAGER' as const };
const teamLeadUserId = new Types.ObjectId().toString();
const teamLeadEmployeeId = new Types.ObjectId();
const teamLeadRequester = { id: teamLeadUserId, role: 'TEAM_LEAD' as const };

describe('employeeService.createEmployee', () => {
  it('rejects non-admin callers in the service layer', async () => {
    await expect(
      employeeService.createEmployee(managerRequester, {
        userId: validUserId,
        employeeId: 'FP-0000',
        department: 'Engineering',
        designation: 'Developer',
        joinedAt: '2024-01-01',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(mockedUserModel.findById).not.toHaveBeenCalled();
  });

  it('creates an employee when the user exists and there are no duplicates', async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: validUserId } as never);
    mockedEmployeeModel.findOne
      .mockResolvedValueOnce(null) // existingByUser
      .mockResolvedValueOnce(null); // existingByEmployeeId
    mockedEmployeeModel.create.mockResolvedValue({ _id: 'emp1' } as never);

    const result = await employeeService.createEmployee(adminRequester, {
      userId: validUserId,
      employeeId: 'FP-0001',
      department: 'Engineering',
      designation: 'Game Programmer',
      joinedAt: '2024-01-01',
    });

    expect(mockedEmployeeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: validUserId, employeeId: 'FP-0001' }),
    );
    expect(result).toEqual({ _id: 'emp1' });
  });

  it('rejects when the userId does not correspond to a real user', async () => {
    mockedUserModel.findById.mockResolvedValue(null as never);

    await expect(
      employeeService.createEmployee(adminRequester, {
        userId: validUserId,
        employeeId: 'FP-0002',
        department: 'Art',
        designation: 'Artist',
        joinedAt: '2024-01-01',
      }),
    ).rejects.toMatchObject({ statusCode: 400 } as Partial<AppError>);

    expect(mockedEmployeeModel.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate employee profile for the same user', async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: validUserId } as never);
    mockedEmployeeModel.findOne
      .mockResolvedValueOnce({ _id: 'existing' } as never) // existingByUser
      .mockResolvedValueOnce(null);

    await expect(
      employeeService.createEmployee(adminRequester, {
        userId: validUserId,
        employeeId: 'FP-0003',
        department: 'QA',
        designation: 'Tester',
        joinedAt: '2024-01-01',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockedEmployeeModel.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate employeeId', async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: validUserId } as never);
    mockedEmployeeModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'other-employee' } as never); // existingByEmployeeId

    await expect(
      employeeService.createEmployee(adminRequester, {
        userId: validUserId,
        employeeId: 'FP-0004',
        department: 'QA',
        designation: 'Tester',
        joinedAt: '2024-01-01',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockedEmployeeModel.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid managerId format before touching the database', async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: validUserId } as never);
    mockedEmployeeModel.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      employeeService.createEmployee(adminRequester, {
        userId: validUserId,
        employeeId: 'FP-0005',
        department: 'QA',
        designation: 'Tester',
        joinedAt: '2024-01-01',
        managerId: 'not-a-valid-id',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedAudit.recordAuditFailure).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMPLOYEE_MANAGER_ASSIGNMENT_FAILED' }));
  });

  it('rejects an inactive or non-manager manager assignment', async () => {
    mockedEmployeeModel.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: managerEmployeeId, isActive: false }) } as never);
    await expect(
      employeeService.createEmployee(adminRequester, {
        userId: validUserId,
        employeeId: 'FP-0006',
        department: 'QA',
        designation: 'Tester',
        joinedAt: '2024-01-01',
        managerId: managerEmployeeId.toString(),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('employeeService.getEmployees (scope rules)', () => {
  it('restricts MANAGER results to direct reports in the service layer', async () => {
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: managerEmployeeId }) }),
    } as never);
    mockedEmployeeModel.aggregate.mockResolvedValue([{ data: [], totalCount: [] }] as never);

    await employeeService.getEmployees(managerRequester, {});

    expect(mockedEmployeeModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([{ $match: { managerId: managerEmployeeId } }]),
    );
  });

  it('rejects TEAM_LEAD directory listing unless a route explicitly grants it', async () => {
    await expect(employeeService.getEmployees(teamLeadRequester, {})).rejects.toMatchObject({ statusCode: 403 });
    expect(mockedEmployeeModel.aggregate).not.toHaveBeenCalled();
  });
});

describe('employeeService.getEmployeeById (ownership rules)', () => {
  const employeeRecord: { _id: string; userId: string; employeeId: string; department: string; designation: string; managerId: Types.ObjectId | null } = {
    _id: validEmployeeId,
    userId: validUserId,
    employeeId: 'FP-0010',
    department: 'Engineering',
    designation: 'Backend Developer',
    managerId: null,
  };

  beforeEach(() => {
    employeeRecord.managerId = null;
    mockedEmployeeModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(employeeRecord),
    } as never);
    mockedUserModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ name: 'Ada', email: 'ada@example.com', role: 'EMPLOYEE', isActive: true }),
      }),
    } as never);
  });

  it('allows an EMPLOYEE to view their own record', async () => {
    const result = await employeeService.getEmployeeById({ id: validUserId, role: 'EMPLOYEE' }, validEmployeeId);
    expect(result.employeeId).toBe('FP-0010');
    // Never leaks passwordHash or any other auth-only field.
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it("blocks an EMPLOYEE from viewing someone else's record", async () => {
    const otherUserId = new Types.ObjectId().toString();
    await expect(
      employeeService.getEmployeeById({ id: otherUserId, role: 'EMPLOYEE' }, validEmployeeId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows ADMIN to view any record', async () => {
    const adminId = new Types.ObjectId().toString();
    const result = await employeeService.getEmployeeById({ id: adminId, role: 'ADMIN' }, validEmployeeId);
    expect(result.employeeId).toBe('FP-0010');
  });

  it('allows MANAGER to view a direct report record', async () => {
    employeeRecord.managerId = managerEmployeeId;
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: managerEmployeeId }) }),
    } as never);
    const result = await employeeService.getEmployeeById(managerRequester, validEmployeeId);
    expect(result.employeeId).toBe('FP-0010');
  });

  it('blocks a MANAGER from viewing an unrelated employee record', async () => {
    employeeRecord.managerId = new Types.ObjectId();
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: managerEmployeeId }) }),
    } as never);

    await expect(employeeService.getEmployeeById(managerRequester, validEmployeeId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('allows a TEAM_LEAD to view a direct report', async () => {
    employeeRecord.managerId = teamLeadEmployeeId;
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: teamLeadEmployeeId }) }),
    } as never);

    const result = await employeeService.getEmployeeById(teamLeadRequester, validEmployeeId);
    expect(result.employeeId).toBe('FP-0010');
  });

  it('blocks a TEAM_LEAD from viewing an unrelated employee record', async () => {
    employeeRecord.managerId = new Types.ObjectId();
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: teamLeadEmployeeId }) }),
    } as never);

    await expect(employeeService.getEmployeeById(teamLeadRequester, validEmployeeId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('throws 404 when the employee does not exist', async () => {
    mockedEmployeeModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
    await expect(
      employeeService.getEmployeeById({ id: validUserId, role: 'ADMIN' }, validEmployeeId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('employeeService.updateEmployee', () => {
  it('only writes whitelisted fields, ignoring anything else in the payload', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const employeeDoc: Record<string, unknown> = {
      _id: validEmployeeId,
      department: 'Old Dept',
      isActive: true,
      employeeId: 'FP-0020',
      save,
    };
    mockedEmployeeModel.findById.mockResolvedValue(employeeDoc as never);

    await employeeService.updateEmployee(adminRequester, validEmployeeId, {
      department: 'New Dept',
      // Attempting to sneak in protected fields:
      isActive: false,
      employeeId: 'HACKED-ID',
    } as never);

    expect(employeeDoc.department).toBe('New Dept');
    // Not in UPDATABLE_FIELDS, so must remain untouched:
    expect(employeeDoc.isActive).toBe(true);
    expect(employeeDoc.employeeId).toBe('FP-0020');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('throws 404 when the employee does not exist', async () => {
    mockedEmployeeModel.findById.mockResolvedValue(null as never);
    await expect(employeeService.updateEmployee(adminRequester, validEmployeeId, { department: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rejects a MANAGER from updating an unrelated employee', async () => {
    const employeeDoc = {
      _id: validEmployeeId,
      userId: validUserId,
      managerId: new Types.ObjectId(),
      save: jest.fn(),
    };
    mockedEmployeeModel.findById.mockResolvedValue(employeeDoc as never);
    mockedEmployeeModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: managerEmployeeId }) }),
    } as never);

    await expect(
      employeeService.updateEmployee(managerRequester, validEmployeeId, { department: 'New Dept' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(employeeDoc.save).not.toHaveBeenCalled();
  });

  it('prevents a MANAGER from changing reporting hierarchy', async () => {
    const employeeDoc = {
      _id: validEmployeeId,
      userId: validUserId,
      managerId: managerEmployeeId,
      save: jest.fn(),
    };
    mockedEmployeeModel.findById.mockResolvedValue(employeeDoc as never);

    await expect(
      employeeService.updateEmployee(managerRequester, validEmployeeId, { managerId: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(employeeDoc.save).not.toHaveBeenCalled();
  });

  it('rejects an employee being set as their own manager', async () => {
    const employeeDoc = { _id: validEmployeeId, save: jest.fn() };
    mockedEmployeeModel.findById.mockResolvedValueOnce(employeeDoc as never);

    await expect(
      employeeService.updateEmployee(adminRequester, validEmployeeId, { managerId: validEmployeeId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('employeeService.updateEmployeeStatus', () => {
  it('deactivates the employee and keeps the linked User in sync', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const employeeDoc = { _id: validEmployeeId, userId: validUserId, isActive: true, save };
    mockedEmployeeModel.findById.mockResolvedValue(employeeDoc as never);
    mockedUserModel.updateOne.mockResolvedValue({} as never);

    const requestingAdmin = { id: new Types.ObjectId().toString(), role: 'ADMIN' as const };
    await employeeService.updateEmployeeStatus(requestingAdmin, validEmployeeId, false);

    expect(employeeDoc.isActive).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(mockedUserModel.updateOne).toHaveBeenCalledWith({ _id: validUserId }, { $set: { isActive: false } });
    expect(mockedTaskModel.updateMany).toHaveBeenCalledWith({ assignedTo: validEmployeeId }, { $set: { assignedTo: null } });
    expect(mockedProjectModel.updateMany).toHaveBeenCalledWith({ members: validEmployeeId }, { $pull: { members: validEmployeeId } });
  });

  it('prevents an admin from deactivating their own linked employee record', async () => {
    const requestingAdminId = validUserId;
    const employeeDoc = { _id: validEmployeeId, userId: validUserId, isActive: true, save: jest.fn() };
    mockedEmployeeModel.findById.mockResolvedValue(employeeDoc as never);

    await expect(
      employeeService.updateEmployeeStatus({ id: requestingAdminId, role: 'ADMIN' }, validEmployeeId, false),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
