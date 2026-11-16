import mongoose from 'mongoose';
import { UserModel } from '../../src/models/User';
import { EmployeeModel } from '../../src/models/Employee';
import { ProjectModel } from '../../src/models/Project';
import { TaskModel } from '../../src/models/Task';
import { AuditEventModel } from '../../src/models/AuditEvent';
import { updateEmployeeStatus } from '../../src/services/employeeService';

const describeReplica = process.env.MONGODB_REPLICA_URI ? describe : describe.skip;

describeReplica('real MongoDB lifecycle transaction verification', () => {
  let adminId: mongoose.Types.ObjectId;
  let employeeId: mongoose.Types.ObjectId;
  let employeeUserId: mongoose.Types.ObjectId;
  let projectId: mongoose.Types.ObjectId;
  let taskId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_REPLICA_URI as string);
  });

  beforeEach(async () => {
    await Promise.all([AuditEventModel.deleteMany({}), TaskModel.deleteMany({}), ProjectModel.deleteMany({}), EmployeeModel.deleteMany({}), UserModel.deleteMany({})]);
    const admin = await UserModel.create({ name: 'Admin', email: `admin-${Date.now()}@test.local`, passwordHash: 'not-used', role: 'ADMIN', isActive: true });
    const employeeUser = await UserModel.create({ name: 'Employee', email: `employee-${Date.now()}@test.local`, passwordHash: 'not-used', role: 'EMPLOYEE', isActive: true });
    const employee = await EmployeeModel.create({ userId: employeeUser._id, employeeId: `FP-${Date.now()}`, department: 'QA', designation: 'Tester', joinedAt: new Date(), isActive: true });
    const project = await ProjectModel.create({ name: 'Lifecycle', projectCode: `LC-${Date.now()}`, startDate: new Date(), managerId: admin._id, members: [employee._id], createdBy: admin._id, isActive: true });
    const task = await TaskModel.create({ title: 'Assigned', projectId: project._id, assignedTo: employee._id, createdBy: admin._id });
    adminId = admin._id; employeeId = employee._id; employeeUserId = employeeUser._id; projectId = project._id; taskId = task._id;
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('commits employee, user, membership, task and audit changes together', async () => {
    await updateEmployeeStatus({ id: adminId.toString(), role: 'ADMIN' }, employeeId.toString(), false);
    expect((await UserModel.findById(employeeUserId))?.isActive).toBe(false);
    expect((await EmployeeModel.findById(employeeId))?.isActive).toBe(false);
    expect((await ProjectModel.findById(projectId))?.members).toHaveLength(0);
    expect((await TaskModel.findById(taskId))?.assignedTo).toBeNull();
    expect(await AuditEventModel.countDocuments({ targetId: employeeId.toString(), action: 'EMPLOYEE_DEACTIVATED' })).toBe(1);
  });

  it('rolls back all lifecycle changes when the audit write fails', async () => {
    jest.spyOn(AuditEventModel, 'create').mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(updateEmployeeStatus({ id: adminId.toString(), role: 'ADMIN' }, employeeId.toString(), false)).rejects.toThrow('audit unavailable');
    expect((await UserModel.findById(employeeUserId))?.isActive).toBe(true);
    expect((await EmployeeModel.findById(employeeId))?.isActive).toBe(true);
    expect((await ProjectModel.findById(projectId))?.members.map(String)).toContain(employeeId.toString());
    expect(String((await TaskModel.findById(taskId))?.assignedTo)).toBe(employeeId.toString());
    (AuditEventModel.create as jest.Mock).mockRestore();
  });
});
