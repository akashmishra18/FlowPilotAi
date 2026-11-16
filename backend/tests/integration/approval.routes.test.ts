import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { UserModel } from '../../src/models/User';
import * as approvalService from '../../src/services/approvalService';

jest.mock('../../src/models/User');
jest.mock('../../src/services/approvalService');

const app = createApp();
const users = UserModel as jest.Mocked<typeof UserModel>;
const service = approvalService as jest.Mocked<typeof approvalService>;

const adminId = new Types.ObjectId().toString();
const managerId = new Types.ObjectId().toString();
const employeeId = new Types.ObjectId().toString();
const taskId = new Types.ObjectId().toString();
const targetId = new Types.ObjectId().toString();
const approvalId = new Types.ObjectId().toString();
const adminToken = signAccessToken(adminId, 'ADMIN');
const managerToken = signAccessToken(managerId, 'MANAGER');
const employeeToken = signAccessToken(employeeId, 'EMPLOYEE');

beforeEach(() => {
  jest.resetAllMocks();
  users.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ isActive: true }) } as never);
});

describe('task reassignment approvals API', () => {
  it('accepts a valid authenticated request and passes its actor to the service', async () => {
    service.createTaskReassignmentRequest.mockResolvedValue({ _id: approvalId } as never);
    const response = await request(app).post('/api/approvals/task-reassignments')
      .set('Authorization', `Bearer ${employeeToken}`).send({ taskId, assignedTo: targetId });
    expect(response.status).toBe(201);
    expect(service.createTaskReassignmentRequest).toHaveBeenCalledWith({ id: employeeId, role: 'EMPLOYEE' }, taskId, targetId);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/approvals/task-reassignments');
    expect(response.status).toBe(401);
  });

  it('allows an admin to list scoped requests through the service', async () => {
    service.listTaskReassignmentRequests.mockResolvedValue({ requests: [] });
    const response = await request(app).get('/api/approvals/task-reassignments').set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(service.listTaskReassignmentRequests).toHaveBeenCalledWith({ id: adminId, role: 'ADMIN' });
  });

  it('routes manager approval decisions to the authorization service', async () => {
    service.approveTaskReassignment.mockResolvedValue({ request: { _id: approvalId } } as never);
    const response = await request(app).post(`/api/approvals/${approvalId}/approve`).set('Authorization', `Bearer ${managerToken}`);
    expect(response.status).toBe(200);
    expect(service.approveTaskReassignment).toHaveBeenCalledWith({ id: managerId, role: 'MANAGER' }, approvalId);
  });

  it('rejects malformed request identifiers at the route boundary', async () => {
    const response = await request(app).post('/api/approvals/task-reassignments')
      .set('Authorization', `Bearer ${adminToken}`).send({ taskId: 'bad', assignedTo: targetId });
    expect(response.status).toBe(422);
    expect(service.createTaskReassignmentRequest).not.toHaveBeenCalled();
  });
});
