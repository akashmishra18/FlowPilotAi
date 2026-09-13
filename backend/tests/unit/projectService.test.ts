import { Types } from 'mongoose';

jest.mock('../../src/models/Project');
jest.mock('../../src/models/Employee');
jest.mock('../../src/models/User');

import { ProjectModel } from '../../src/models/Project';
import { EmployeeModel } from '../../src/models/Employee';
import { UserModel } from '../../src/models/User';
import * as projectService from '../../src/services/projectService';

const mockedProjectModel = ProjectModel as jest.Mocked<typeof ProjectModel>;
const mockedEmployeeModel = EmployeeModel as jest.Mocked<typeof EmployeeModel>;
const mockedUserModel = UserModel as jest.Mocked<typeof UserModel>;

/** Builds a fluent mongoose-query-like mock chain terminating in `lean()`. */
function chainable(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['populate', 'sort', 'skip', 'limit', 'select'];
  methods.forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.lean = jest.fn().mockResolvedValue(resolvedValue);
  return chain as never;
}

const adminUserId = new Types.ObjectId().toString();
const managerUserId = new Types.ObjectId().toString();
const otherManagerUserId = new Types.ObjectId().toString();
const employeeUserId = new Types.ObjectId().toString();
const projectId = new Types.ObjectId().toString();
const employeeId = new Types.ObjectId().toString();

describe('projectService.createProject', () => {
  const baseInput = {
    name: 'Space Shooter',
    projectCode: 'FP-01',
    startDate: '2024-01-01',
    managerId: managerUserId,
    createdBy: adminUserId,
  };

  it('creates a project when the manager is valid and the code is unique', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findOne.mockResolvedValueOnce(null);
    mockedProjectModel.create.mockResolvedValueOnce({ _id: 'proj1' } as never);

    const result = await projectService.createProject(baseInput);

    expect(mockedProjectModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Space Shooter', projectCode: 'FP-01', status: 'PLANNING', priority: 'MEDIUM' }),
    );
    expect(result).toEqual({ _id: 'proj1' });
  });

  it('rejects when managerId does not correspond to a real user', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable(null));

    await expect(projectService.createProject(baseInput)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedProjectModel.create).not.toHaveBeenCalled();
  });

  it('rejects when the assigned manager has role EMPLOYEE', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'EMPLOYEE' }));

    await expect(projectService.createProject(baseInput)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedProjectModel.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate projectCode', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findOne.mockResolvedValueOnce({ _id: 'existing' } as never);

    await expect(projectService.createProject(baseInput)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockedProjectModel.create).not.toHaveBeenCalled();
  });

  it('rejects when deadline is before startDate', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findOne.mockResolvedValueOnce(null);

    await expect(
      projectService.createProject({ ...baseInput, deadline: '2023-12-01' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedProjectModel.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive employee as a member', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findOne.mockResolvedValueOnce(null);
    mockedEmployeeModel.find.mockReturnValueOnce(
      chainable([{ _id: employeeId, isActive: false }]),
    );

    await expect(
      projectService.createProject({ ...baseInput, members: [employeeId] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedProjectModel.create).not.toHaveBeenCalled();
  });

  it('rejects a member id that does not correspond to any employee', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findOne.mockResolvedValueOnce(null);
    mockedEmployeeModel.find.mockReturnValueOnce(chainable([]));

    await expect(
      projectService.createProject({ ...baseInput, members: [employeeId] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('projectService.getProjects (role-scoped visibility)', () => {
  beforeEach(() => {
    mockedProjectModel.find.mockReturnValue(chainable([{ _id: projectId }]));
    mockedProjectModel.countDocuments.mockResolvedValue(1 as never);
  });

  it('ADMIN sees all projects (no forced managerId/members scoping)', async () => {
    await projectService.getProjects({ id: adminUserId, role: 'ADMIN' }, {});
    expect(mockedProjectModel.find).toHaveBeenCalledWith(expect.not.objectContaining({ managerId: expect.anything() }));
  });

  it("MANAGER's results are always forced to their own managerId, even if a different managerId filter is passed", async () => {
    await projectService.getProjects(
      { id: managerUserId, role: 'MANAGER' },
      { managerId: otherManagerUserId },
    );
    expect(mockedProjectModel.find).toHaveBeenCalledWith(expect.objectContaining({ managerId: managerUserId }));
  });

  it('EMPLOYEE with no employee profile gets an empty result instead of an error', async () => {
    mockedEmployeeModel.findOne.mockReturnValueOnce(chainable(null));

    const result = await projectService.getProjects({ id: employeeUserId, role: 'EMPLOYEE' }, {});

    expect(result.projects).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it("EMPLOYEE's results are scoped to projects where their Employee record is a member", async () => {
    mockedEmployeeModel.findOne.mockReturnValueOnce(chainable({ _id: employeeId }));

    await projectService.getProjects({ id: employeeUserId, role: 'EMPLOYEE' }, {});

    expect(mockedProjectModel.find).toHaveBeenCalledWith(expect.objectContaining({ members: employeeId }));
  });
});

describe('projectService.getProjectById (visibility rules)', () => {
  const projectRecord = {
    _id: projectId,
    managerId: { _id: managerUserId },
    members: [{ _id: employeeId }],
  };

  it('allows ADMIN to view any project', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(projectRecord));
    const result = await projectService.getProjectById({ id: adminUserId, role: 'ADMIN' }, projectId);
    expect(result).toBe(projectRecord);
  });

  it('allows the assigned MANAGER to view their project', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(projectRecord));
    const result = await projectService.getProjectById({ id: managerUserId, role: 'MANAGER' }, projectId);
    expect(result).toBe(projectRecord);
  });

  it('blocks a different MANAGER from viewing a project they do not manage', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(projectRecord));
    await expect(
      projectService.getProjectById({ id: otherManagerUserId, role: 'MANAGER' }, projectId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('allows an EMPLOYEE who is a member to view the project', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(projectRecord));
    mockedEmployeeModel.findOne.mockReturnValueOnce(chainable({ _id: employeeId }));

    const result = await projectService.getProjectById({ id: employeeUserId, role: 'EMPLOYEE' }, projectId);
    expect(result).toBe(projectRecord);
  });

  it('blocks an EMPLOYEE who is not a member', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(projectRecord));
    mockedEmployeeModel.findOne.mockReturnValueOnce(chainable({ _id: new Types.ObjectId().toString() }));

    await expect(
      projectService.getProjectById({ id: employeeUserId, role: 'EMPLOYEE' }, projectId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when the project does not exist', async () => {
    mockedProjectModel.findById.mockReturnValueOnce(chainable(null));
    await expect(
      projectService.getProjectById({ id: adminUserId, role: 'ADMIN' }, projectId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('projectService.updateProject', () => {
  it('only writes whitelisted fields, ignoring status/managerId/members/isActive', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project: Record<string, unknown> = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      name: 'Old Name',
      status: 'PLANNING',
      isActive: true,
      startDate: new Date('2024-01-01'),
      deadline: null,
      save,
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.updateProject({ id: managerUserId, role: 'MANAGER' }, projectId, {
      name: 'New Name',
      status: 'COMPLETED',
      isActive: false,
    } as never);

    expect(project.name).toBe('New Name');
    expect(project.status).toBe('PLANNING'); // untouched — not a whitelisted field
    expect(project.isActive).toBe(true); // untouched
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('blocks a MANAGER from updating a project they do not manage', async () => {
    const project = { _id: projectId, managerId: { toString: () => otherManagerUserId }, save: jest.fn() };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await expect(
      projectService.updateProject({ id: managerUserId, role: 'MANAGER' }, projectId, { name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(project.save).not.toHaveBeenCalled();
  });

  it('allows ADMIN to update any project', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project: Record<string, unknown> = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      name: 'Old',
      save,
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.updateProject({ id: adminUserId, role: 'ADMIN' }, projectId, { name: 'New' });
    expect(project.name).toBe('New');
  });

  it('throws 404 when the project does not exist', async () => {
    mockedProjectModel.findById.mockResolvedValueOnce(null as never);
    await expect(
      projectService.updateProject({ id: adminUserId, role: 'ADMIN' }, projectId, { name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('projectService.updateProjectStatus', () => {
  it('allows the managing MANAGER to change status', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = { _id: projectId, managerId: { toString: () => managerUserId }, status: 'PLANNING', save };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.updateProjectStatus({ id: managerUserId, role: 'MANAGER' }, projectId, 'ACTIVE');
    expect(project.status).toBe('ACTIVE');
  });

  it('blocks a non-managing MANAGER from changing status', async () => {
    const project = { _id: projectId, managerId: { toString: () => otherManagerUserId }, status: 'PLANNING', save: jest.fn() };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await expect(
      projectService.updateProjectStatus({ id: managerUserId, role: 'MANAGER' }, projectId, 'ACTIVE'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('projectService.assignManager', () => {
  it('reassigns the manager when the new manager is valid', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = { _id: projectId, managerId: managerUserId, save };
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'MANAGER' }));
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.assignManager(projectId, otherManagerUserId);
    expect(String(project.managerId)).toBe(otherManagerUserId);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects a new manager with an ineligible role', async () => {
    mockedUserModel.findById.mockReturnValueOnce(chainable({ role: 'EMPLOYEE' }));
    await expect(projectService.assignManager(projectId, employeeUserId)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('projectService.addMember / removeMember', () => {
  it('adds a new, active, not-already-a-member employee', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      members: [] as { toString: () => string }[],
      save,
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);
    mockedEmployeeModel.findById.mockReturnValueOnce(chainable({ _id: employeeId, isActive: true }));

    await projectService.addMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId);
    expect(project.members).toHaveLength(1);
  });

  it('rejects adding an inactive employee', async () => {
    const project = { _id: projectId, managerId: { toString: () => managerUserId }, members: [], save: jest.fn() };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);
    mockedEmployeeModel.findById.mockReturnValueOnce(chainable({ _id: employeeId, isActive: false }));

    await expect(
      projectService.addMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects adding a member who is already on the project', async () => {
    const project = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      members: [{ toString: () => employeeId }],
      save: jest.fn(),
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);
    mockedEmployeeModel.findById.mockReturnValueOnce(chainable({ _id: employeeId, isActive: true }));

    await expect(
      projectService.addMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('removes an existing member', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      members: [{ toString: () => employeeId }],
      save,
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.removeMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId);
    expect(project.members).toHaveLength(0);
  });

  it('throws 404 when removing an employee who is not a member', async () => {
    const project = {
      _id: projectId,
      managerId: { toString: () => managerUserId },
      members: [],
      save: jest.fn(),
    };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await expect(
      projectService.removeMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('blocks a non-managing MANAGER from adding members', async () => {
    const project = { _id: projectId, managerId: { toString: () => otherManagerUserId }, members: [], save: jest.fn() };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await expect(
      projectService.addMember({ id: managerUserId, role: 'MANAGER' }, projectId, employeeId),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('projectService.deactivateProject', () => {
  it('deactivates an active project', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = { _id: projectId, isActive: true, save };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await projectService.deactivateProject(projectId);
    expect(project.isActive).toBe(false);
  });

  it('rejects deactivating an already-inactive project', async () => {
    const project = { _id: projectId, isActive: false, save: jest.fn() };
    mockedProjectModel.findById.mockResolvedValueOnce(project as never);

    await expect(projectService.deactivateProject(projectId)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when the project does not exist', async () => {
    mockedProjectModel.findById.mockResolvedValueOnce(null as never);
    await expect(projectService.deactivateProject(projectId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
