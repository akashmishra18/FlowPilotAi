import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { AppError } from '../../src/utils/AppError';
import * as employeeService from '../../src/services/employeeService';

jest.mock('../../src/services/employeeService');

const mockedEmployeeService = employeeService as jest.Mocked<typeof employeeService>;

const app = createApp();

const adminToken = signAccessToken(new Types.ObjectId().toString(), 'ADMIN');
const managerToken = signAccessToken(new Types.ObjectId().toString(), 'MANAGER');
const employeeUserId = new Types.ObjectId().toString();
const employeeToken = signAccessToken(employeeUserId, 'EMPLOYEE');

const fakeEmployee = {
  _id: new Types.ObjectId().toString(),
  userId: new Types.ObjectId().toString(),
  employeeId: 'FP-0001',
  department: 'Engineering',
  designation: 'Game Programmer',
  isActive: true,
};

const validId = new Types.ObjectId().toString();

describe('POST /api/employees (RBAC)', () => {
  const validBody = {
    userId: new Types.ObjectId().toString(),
    employeeId: 'FP-0099',
    department: 'Engineering',
    designation: 'Developer',
    joinedAt: '2024-01-01',
  };

  it('ADMIN can create an employee', async () => {
    mockedEmployeeService.createEmployee.mockResolvedValue(fakeEmployee as never);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockedEmployeeService.createEmployee).toHaveBeenCalledTimes(1);
  });

  it('MANAGER cannot create an employee', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(mockedEmployeeService.createEmployee).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot create an employee', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(mockedEmployeeService.createEmployee).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/employees').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload with 422 before reaching the service', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ department: 'Engineering' }); // missing required fields

    expect(res.status).toBe(422);
    expect(mockedEmployeeService.createEmployee).not.toHaveBeenCalled();
  });
});

describe('GET /api/employees (RBAC)', () => {
  beforeEach(() => {
    mockedEmployeeService.getEmployees.mockResolvedValue({
      employees: [fakeEmployee],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
  });

  it('ADMIN can list employees', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.employees).toHaveLength(1);
  });

  it('MANAGER can list employees', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it('EMPLOYEE cannot list all employees', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
    expect(mockedEmployeeService.getEmployees).not.toHaveBeenCalled();
  });
});

describe('GET /api/employees/me', () => {
  it('returns the current employee profile for any authenticated role', async () => {
    mockedEmployeeService.getCurrentEmployeeProfile.mockResolvedValue(fakeEmployee as never);

    const res = await request(app).get('/api/employees/me').set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(mockedEmployeeService.getCurrentEmployeeProfile).toHaveBeenCalledWith(employeeUserId);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/employees/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/employees/:id (ownership enforced in service layer)', () => {
  it('allows the request through to the service for any authenticated role', async () => {
    mockedEmployeeService.getEmployeeById.mockResolvedValue(fakeEmployee as never);

    const res = await request(app)
      .get(`/api/employees/${validId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(mockedEmployeeService.getEmployeeById).toHaveBeenCalledWith(
      { id: employeeUserId, role: 'EMPLOYEE' },
      validId,
    );
  });

  it("propagates a 403 from the service when an EMPLOYEE requests someone else's record", async () => {
    mockedEmployeeService.getEmployeeById.mockRejectedValue(
      new AppError('You do not have permission to view this employee', 403),
    );

    const res = await request(app)
      .get(`/api/employees/${validId}`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects a malformed id with 422 before reaching the service', async () => {
    const res = await request(app)
      .get('/api/employees/not-a-valid-id')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
    expect(mockedEmployeeService.getEmployeeById).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/employees/:id (RBAC)', () => {
  const updateBody = { department: 'New Department' };

  it('ADMIN can update an employee', async () => {
    mockedEmployeeService.updateEmployee.mockResolvedValue(fakeEmployee as never);

    const res = await request(app)
      .patch(`/api/employees/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updateBody);

    expect(res.status).toBe(200);
    expect(mockedEmployeeService.updateEmployee).toHaveBeenCalledWith(validId, updateBody);
  });

  it('MANAGER can update permitted employee fields', async () => {
    mockedEmployeeService.updateEmployee.mockResolvedValue(fakeEmployee as never);

    const res = await request(app)
      .patch(`/api/employees/${validId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send(updateBody);

    expect(res.status).toBe(200);
  });

  it('EMPLOYEE cannot update employee records', async () => {
    const res = await request(app)
      .patch(`/api/employees/${validId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(updateBody);

    expect(res.status).toBe(403);
    expect(mockedEmployeeService.updateEmployee).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/employees/:id/status (ADMIN only)', () => {
  it('ADMIN can activate/deactivate an employee', async () => {
    mockedEmployeeService.updateEmployeeStatus.mockResolvedValue(fakeEmployee as never);

    const res = await request(app)
      .patch(`/api/employees/${validId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
  });

  it('MANAGER cannot activate/deactivate an employee', async () => {
    const res = await request(app)
      .patch(`/api/employees/${validId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(mockedEmployeeService.updateEmployeeStatus).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot activate/deactivate an employee', async () => {
    const res = await request(app)
      .patch(`/api/employees/${validId}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  it('rejects a non-boolean isActive with 422', async () => {
    const res = await request(app)
      .patch(`/api/employees/${validId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: 'yes' });

    expect(res.status).toBe(422);
    expect(mockedEmployeeService.updateEmployeeStatus).not.toHaveBeenCalled();
  });
});
