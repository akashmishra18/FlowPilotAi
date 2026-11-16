import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import * as projectService from '../services/projectService';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.createProject(req.user!, { ...req.body, createdBy: req.user!.id });
  sendSuccess(res, { project }, 201, 'Project created successfully');
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, search, status, priority, managerId, isActive } = req.query;

  const result = await projectService.getProjects(req.user!, {
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    search: search as string | undefined,
    status: status as never,
    priority: priority as never,
    managerId: managerId as string | undefined,
    isActive: isActive === undefined ? undefined : isActive === 'true',
  });

  sendSuccess(res, result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.getProjectById(req.user!, req.params.id);
  sendSuccess(res, { project });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.updateProject(req.user!, req.params.id, req.body);
  sendSuccess(res, { project }, 200, 'Project updated successfully');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.updateProjectStatus(req.user!, req.params.id, req.body.status);
  sendSuccess(res, { project }, 200, 'Project status updated successfully');
});

export const updateManager = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.assignManager(req.user!, req.params.id, req.body.managerId);
  sendSuccess(res, { project }, 200, 'Project manager updated successfully');
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.addMember(req.user!, req.params.id, req.body.employeeId);
  sendSuccess(res, { project }, 200, 'Member added successfully');
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.removeMember(req.user!, req.params.id, req.params.employeeId);
  sendSuccess(res, { project }, 200, 'Member removed successfully');
});

export const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const project = await projectService.deactivateProject(req.user!, req.params.id);
  sendSuccess(res, { project }, 200, 'Project deactivated successfully');
});
