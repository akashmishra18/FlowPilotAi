import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { AppError } from '../../src/utils/AppError';
import * as projectService from '../../src/services/projectService';

jest.mock('../../src/services/projectService');

const mockedProjectService = projectService as jest.Mocked<typeof projectService>;

const app = createApp();

const adminId = new Types.ObjectId().toString();
const managerId = new Types.ObjectId().toString();
const employeeId = new Types.ObjectId().toString();

const adminToken = signAccessToken(adminId, 'ADMIN');
const managerToken = signAccessToken(managerId, 'MANAGER');
const employeeToken = signAccessToken(employeeId, 'EMPLOYEE');

const validId = new Types.ObjectId().toString();
const validMemberId = new Types.ObjectId().toString();

const fakeProject = { _id: validId, name: 'Space Shooter', projectCode: 'FP-01', status: 'PLANNING' };

describe('POST /api/projects (RBAC)', () => {
  const validBody = {
    name: 'Space Shooter',
    projectCode: 'FP-01',
    startDate: '2024-01-01',
    managerId: new Types.ObjectId().toString(),
  };

  it('ADMIN can create a project', async () => {
    mockedProjectService.createProject.mockResolvedValue(fakeProject as never);

    const res = await request(app).post('/api/projects').set('Authorization', `Bearer ${adminToken}`).send(validBody);

    expect(res.status).toBe(201);
    expect(mockedProjectService.createProject).toHaveBeenCalledTimes(1);
  });

  it('MANAGER cannot create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
    expect(mockedProjectService.createProject).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send(validBody);

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).post('/api/projects').send(validBody);
    expect(res.status).toBe(401);
  });

  it('rejects invalid payloads with 422 before reaching the service', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Missing required fields' });

    expect(res.status).toBe(422);
    expect(mockedProjectService.createProject).not.toHaveBeenCalled();
  });

  it('rejects an invalid status enum value', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBody, status: 'NOT_A_REAL_STATUS' });

    expect(res.status).toBe(422);
    expect(mockedProjectService.createProject).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects (all roles, scoped by service)', () => {
  beforeEach(() => {
    mockedProjectService.getProjects.mockResolvedValue({
      projects: [fakeProject],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    } as never);
  });

  it('ADMIN can list projects', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('MANAGER can list projects', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it('EMPLOYEE can list projects (scoped to their memberships by the service)', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(mockedProjectService.getProjects).toHaveBeenCalledWith(
      { id: employeeId, role: 'EMPLOYEE' },
      expect.any(Object),
    );
  });

  it('rejects an invalid pagination param with 422', async () => {
    const res = await request(app)
      .get('/api/projects?page=0')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('passes through search/status/priority/manager/active filters', async () => {
    await request(app)
      .get(
        `/api/projects?search=shooter&status=ACTIVE&priority=HIGH&managerId=${managerId}&isActive=true&page=2&limit=5`,
      )
      .set('Authorization', `Bearer ${adminToken}`);

    expect(mockedProjectService.getProjects).toHaveBeenCalledWith(
      { id: adminId, role: 'ADMIN' },
      expect.objectContaining({
        search: 'shooter',
        status: 'ACTIVE',
        priority: 'HIGH',
        managerId,
        isActive: true,
        page: 2,
        limit: 5,
      }),
    );
  });
});

describe('GET /api/projects/:id (visibility enforced in service)', () => {
  it('allows the request through for any authenticated role', async () => {
    mockedProjectService.getProjectById.mockResolvedValue(fakeProject as never);

    const res = await request(app).get(`/api/projects/${validId}`).set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(mockedProjectService.getProjectById).toHaveBeenCalledWith({ id: employeeId, role: 'EMPLOYEE' }, validId);
  });

  it('propagates a 403 from the service for an unauthorized viewer', async () => {
    mockedProjectService.getProjectById.mockRejectedValue(
      new AppError('You do not have permission to view this project', 403),
    );

    const res = await request(app).get(`/api/projects/${validId}`).set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects a malformed id with 422', async () => {
    const res = await request(app)
      .get('/api/projects/not-a-valid-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
    expect(mockedProjectService.getProjectById).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/projects/:id (RBAC)', () => {
  it('ADMIN can update', async () => {
    mockedProjectService.updateProject.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .patch(`/api/projects/${validId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
  });

  it('MANAGER can attempt an update (ownership enforced in service)', async () => {
    mockedProjectService.updateProject.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .patch(`/api/projects/${validId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
  });

  it('EMPLOYEE cannot update a project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(403);
    expect(mockedProjectService.updateProject).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/projects/:id/status', () => {
  it('rejects an invalid status value with 422', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'NOT_REAL' });
    expect(res.status).toBe(422);
    expect(mockedProjectService.updateProjectStatus).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot change status', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}/status`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/projects/:id/manager (ADMIN only)', () => {
  it('ADMIN can reassign the manager', async () => {
    mockedProjectService.assignManager.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .patch(`/api/projects/${validId}/manager`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ managerId: new Types.ObjectId().toString() });
    expect(res.status).toBe(200);
  });

  it('MANAGER cannot reassign the manager, even for their own project', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}/manager`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ managerId: new Types.ObjectId().toString() });
    expect(res.status).toBe(403);
    expect(mockedProjectService.assignManager).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/:id/members and DELETE .../members/:employeeId', () => {
  it('ADMIN can add a member', async () => {
    mockedProjectService.addMember.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .post(`/api/projects/${validId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: validMemberId });
    expect(res.status).toBe(200);
  });

  it('EMPLOYEE cannot add a member', async () => {
    const res = await request(app)
      .post(`/api/projects/${validId}/members`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ employeeId: validMemberId });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid employeeId with 422', async () => {
    const res = await request(app)
      .post(`/api/projects/${validId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 'not-valid' });
    expect(res.status).toBe(422);
  });

  it('MANAGER can remove a member (ownership enforced in service)', async () => {
    mockedProjectService.removeMember.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .delete(`/api/projects/${validId}/members/${validMemberId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it('EMPLOYEE cannot remove a member', async () => {
    const res = await request(app)
      .delete(`/api/projects/${validId}/members/${validMemberId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/projects/:id/deactivate (ADMIN only)', () => {
  it('ADMIN can deactivate', async () => {
    mockedProjectService.deactivateProject.mockResolvedValue(fakeProject as never);
    const res = await request(app)
      .patch(`/api/projects/${validId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('MANAGER cannot deactivate', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}/deactivate`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
    expect(mockedProjectService.deactivateProject).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot deactivate', async () => {
    const res = await request(app)
      .patch(`/api/projects/${validId}/deactivate`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });
});
