import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { AppError } from '../../src/utils/AppError';
import * as taskService from '../../src/services/taskService';

jest.mock('../../src/services/taskService');
const mockedService = taskService as jest.Mocked<typeof taskService>;

const app = createApp();

const adminId = new Types.ObjectId().toString();
const managerId = new Types.ObjectId().toString();
const employeeId = new Types.ObjectId().toString();
const adminToken = signAccessToken(adminId, 'ADMIN');
const managerToken = signAccessToken(managerId, 'MANAGER');
const employeeToken = signAccessToken(employeeId, 'EMPLOYEE');

const taskId = new Types.ObjectId().toString();
const projectId = new Types.ObjectId().toString();
const empRef = new Types.ObjectId().toString();
const fakeTask = { _id: taskId, title: 'Fix crash', status: 'TODO' };

beforeEach(() => jest.resetAllMocks());

describe('POST /api/tasks', () => {
  const validBody = { title: 'Fix crash', projectId, assignedTo: empRef, priority: 'HIGH', tags: ['bug'] };

  it('ADMIN can create a task', async () => {
    mockedService.createTask.mockResolvedValue(fakeTask as never);
    const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockedService.createTask).toHaveBeenCalledWith(
      { id: adminId, role: 'ADMIN' },
      expect.objectContaining({ title: 'Fix crash', projectId }),
    );
  });

  it('MANAGER can reach creation (project ownership is enforced in the service)', async () => {
    mockedService.createTask.mockResolvedValue(fakeTask as never);
    const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${managerToken}`).send(validBody);
    expect(res.status).toBe(201);
  });

  it('EMPLOYEE cannot create a task', async () => {
    const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${employeeToken}`).send(validBody);
    expect(res.status).toBe(403);
    expect(mockedService.createTask).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/tasks').send(validBody);
    expect(res.status).toBe(401);
  });

  it.each([
    ['missing title', { projectId }],
    ['missing projectId', { title: 'x' }],
    ['malformed projectId', { title: 'x', projectId: 'nope' }],
    ['malformed assignedTo', { title: 'x', projectId, assignedTo: 'nope' }],
    ['invalid priority', { title: 'x', projectId, priority: 'URGENT' }],
    ['invalid status', { title: 'x', projectId, status: 'DONE' }],
    ['invalid dueDate', { title: 'x', projectId, dueDate: 'tomorrow-ish' }],
    ['too many tags', { title: 'x', projectId, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ['over-long title', { title: 'a'.repeat(201), projectId }],
  ])('returns 422 for %s without reaching the service', async (_name, body) => {
    const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(res.status).toBe(422);
    expect(mockedService.createTask).not.toHaveBeenCalled();
  });

  it('does not forward a client-supplied createdBy to the service', async () => {
    mockedService.createTask.mockResolvedValue(fakeTask as never);
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBody, createdBy: new Types.ObjectId().toString() });
    expect(mockedService.createTask.mock.calls[0][1]).not.toHaveProperty('createdBy');
  });

  it('propagates service errors (e.g. inactive employee) with their status', async () => {
    mockedService.createTask.mockRejectedValue(new AppError('Inactive employees cannot be assigned tasks', 400));
    const res = await request(app).post('/api/tasks').set('Authorization', `Bearer ${adminToken}`).send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Inactive employees cannot be assigned tasks');
  });
});

describe('GET /api/tasks', () => {
  beforeEach(() => {
    mockedService.listTasks.mockResolvedValue({
      tasks: [fakeTask],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
  });

  it.each([
    ['ADMIN', adminToken, adminId],
    ['MANAGER', managerToken, managerId],
    ['EMPLOYEE', employeeToken, employeeId],
  ])('%s can list (scoped by the service)', async (role, token, id) => {
    const res = await request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
    expect(mockedService.listTasks).toHaveBeenCalledWith({ id, role }, expect.any(Object));
  });

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/api/tasks')).status).toBe(401);
  });

  it('passes typed filters through to the service', async () => {
    await request(app)
      .get(
        `/api/tasks?projectId=${projectId}&assignedTo=${empRef}&status=BLOCKED&priority=CRITICAL` +
          `&dueDateFrom=2025-01-01&dueDateTo=2025-12-31&overdue=true&search=crash&page=2&limit=5`,
      )
      .set('Authorization', `Bearer ${adminToken}`);

    expect(mockedService.listTasks).toHaveBeenCalledWith(
      { id: adminId, role: 'ADMIN' },
      {
        page: 2,
        limit: 5,
        projectId,
        assignedTo: empRef,
        status: 'BLOCKED',
        priority: 'CRITICAL',
        dueDateFrom: '2025-01-01',
        dueDateTo: '2025-12-31',
        overdue: true,
        search: 'crash',
      },
    );
  });

  it.each([
    ['status', 'status=NOPE'],
    ['priority', 'priority=NOPE'],
    ['projectId', 'projectId=bad'],
    ['assignedTo', 'assignedTo=bad'],
    ['overdue', 'overdue=maybe'],
    ['dueDateFrom', 'dueDateFrom=soon'],
    ['page', 'page=0'],
    ['limit', 'limit=1000'],
  ])('returns 422 for an invalid %s filter', async (_n, qs) => {
    const res = await request(app).get(`/api/tasks?${qs}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(mockedService.listTasks).not.toHaveBeenCalled();
  });

  it('does not accept arbitrary Mongo operators as filters', async () => {
    const res = await request(app)
      .get('/api/tasks?status[$ne]=COMPLETED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(mockedService.listTasks).not.toHaveBeenCalled();
  });
});

describe('GET /api/tasks/:id', () => {
  it('forwards the requester so the service can enforce visibility', async () => {
    mockedService.getTaskById.mockResolvedValue(fakeTask as never);
    const res = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(mockedService.getTaskById).toHaveBeenCalledWith({ id: employeeId, role: 'EMPLOYEE' }, taskId);
  });

  it('propagates a 403 for an unauthorized viewer', async () => {
    mockedService.getTaskById.mockRejectedValue(new AppError('You do not have permission to view this task', 403));
    const res = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('propagates a 404', async () => {
    mockedService.getTaskById.mockRejectedValue(new AppError('Task not found', 404));
    const res = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('422 on a malformed id', async () => {
    const res = await request(app).get('/api/tasks/not-an-id').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('401 without a token', async () => {
    expect((await request(app).get(`/api/tasks/${taskId}`)).status).toBe(401);
  });
});

describe('PATCH /api/tasks/:id', () => {
  beforeEach(() => mockedService.updateTask.mockResolvedValue(fakeTask as never));

  it.each([
    ['ADMIN', adminToken],
    ['MANAGER', managerToken],
    ['EMPLOYEE', employeeToken],
  ])('%s reaches the service (field/ownership rules live there)', async (_r, token) => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
  });

  it("returns the service's 403 when an assignee touches protected fields", async () => {
    mockedService.updateTask.mockRejectedValue(new AppError('You are not allowed to change: priority', 403));
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ priority: 'LOW' });
    expect(res.status).toBe(403);
  });

  it('rejects any attempt to change projectId (project ownership)', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectId: new Types.ObjectId().toString() });
    expect(res.status).toBe(422);
    expect(mockedService.updateTask).not.toHaveBeenCalled();
  });

  it('rejects any attempt to change createdBy', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ createdBy: new Types.ObjectId().toString() });
    expect(res.status).toBe(422);
  });

  it.each([
    ['invalid status', { status: 'DONE' }],
    ['invalid priority', { priority: 'URGENT' }],
    ['malformed assignedTo', { assignedTo: 'nope' }],
    ['invalid dueDate', { dueDate: 'later' }],
    ['empty title', { title: '' }],
  ])('422 for %s', async (_n, body) => {
    const res = await request(app).patch(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${adminToken}`).send(body);
    expect(res.status).toBe(422);
    expect(mockedService.updateTask).not.toHaveBeenCalled();
  });

  it('allows null to unassign / clear the due date', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assignedTo: null, dueDate: null });
    expect(res.status).toBe(200);
  });

  it('401 without a token', async () => {
    expect((await request(app).patch(`/api/tasks/${taskId}`).send({ title: 'x' })).status).toBe(401);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it.each([
    ['ADMIN', adminToken],
    ['MANAGER', managerToken],
  ])('%s can reach deletion', async (_r, token) => {
    mockedService.deleteTask.mockResolvedValue(undefined);
    const res = await request(app).delete(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('EMPLOYEE cannot delete', async () => {
    const res = await request(app).delete(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
    expect(mockedService.deleteTask).not.toHaveBeenCalled();
  });

  it('propagates the completed-task rule from the service', async () => {
    mockedService.deleteTask.mockRejectedValue(new AppError('Only an admin can delete a completed task', 403));
    const res = await request(app).delete(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it('401 without a token, 422 for a bad id', async () => {
    expect((await request(app).delete(`/api/tasks/${taskId}`)).status).toBe(401);
    const res = await request(app).delete('/api/tasks/bad').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });
});
