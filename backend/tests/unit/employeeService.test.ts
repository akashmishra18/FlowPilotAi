import { Types } from 'mongoose';
import { AppError } from '../../src/utils/AppError';

jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');

// Imported after the mocks so the mocked versions are what get wired in.
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';
import * as employeeService from '../../src/services/employeeService';

const mockedEmployeeModel = EmployeeModel as jest.Mocked<typeof EmployeeModel>;
const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;

const validUserId = new Types.ObjectId().toString();
const validEmployeeId = new Types.ObjectId().toString();

describe('employeeService.createEmployee', () => {
  it('creates an employee when the user exists and there are no duplicates', async () => {
    mockedUserModel.findById.mockResolvedValue({ _id: validUserId } as never);
    mockedEmployeeModel.findOne
      .mockResolvedValueOnce(null) // existingByUser
      .mockResolvedValueOnce(null); // existingByEmployeeId
    mockedEmployeeModel.create.mockResolvedValue({ _id: 'emp1' } as never);

    const result = await employeeService.createEmployee({
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
      employeeService.createEmployee({
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
      employeeService.createEmployee({
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
      employeeService.createEmployee({
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
      employeeService.createEmployee({
        userId: validUserId,
        employeeId: 'FP-0005',
        department: 'QA',
        designation: 'Tester',
        joinedAt: '2024-01-01',
        managerId: 'not-a-valid-id',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('employeeService.getEmployeeById (ownership rules)', () => {
  const employeeRecord = {
    _id: validEmployeeId,
    userId: validUserId,
    employeeId: 'FP-0010',
    department: 'Engineering',
    designation: 'Backend Developer',
  };

  beforeEach(() => {
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

  it('allows MANAGER to view any record', async () => {
    const managerId = new Types.ObjectId().toString();
    const result = await employeeService.getEmployeeById({ id: managerId, role: 'MANAGER' }, validEmployeeId);
    expect(result.employeeId).toBe('FP-0010');
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

    await employeeService.updateEmployee(validEmployeeId, {
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
    await expect(employeeService.updateEmployee(validEmployeeId, { department: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rejects an employee being set as their own manager', async () => {
    const employeeDoc = { _id: validEmployeeId, save: jest.fn() };
    mockedEmployeeModel.findById.mockResolvedValueOnce(employeeDoc as never);

    await expect(
      employeeService.updateEmployee(validEmployeeId, { managerId: validEmployeeId }),
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
