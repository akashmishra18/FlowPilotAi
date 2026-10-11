import { apiClient } from '@/services/apiClient';
import {
  Project,
  ProjectListFilters,
  ProjectListResponse,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
} from './types';

export async function listProjects(filters: ProjectListFilters): Promise<ProjectListResponse> {
  const params: Record<string, string> = {};
  if (filters.page) params.page = String(filters.page);
  if (filters.limit) params.limit = String(filters.limit);
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.priority) params.priority = filters.priority;
  if (filters.managerId) params.managerId = filters.managerId;
  if (typeof filters.isActive === 'boolean') params.isActive = String(filters.isActive);

  const res = await apiClient.get('/projects', { params });
  return res.data.data as ProjectListResponse;
}

export async function getProjectById(id: string): Promise<Project> {
  const res = await apiClient.get(`/projects/${id}`);
  return res.data.data.project as Project;
}

export async function createProject(input: CreateProjectInput): Promise<void> {
  await apiClient.post('/projects', input);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<void> {
  await apiClient.patch(`/projects/${id}`, input);
}

export async function updateProjectStatus(id: string, status: ProjectStatus): Promise<void> {
  await apiClient.patch(`/projects/${id}/status`, { status });
}

export async function assignManager(id: string, managerId: string): Promise<void> {
  await apiClient.patch(`/projects/${id}/manager`, { managerId });
}

export async function addMember(id: string, employeeId: string): Promise<void> {
  await apiClient.post(`/projects/${id}/members`, { employeeId });
}

export async function removeMember(id: string, employeeId: string): Promise<void> {
  await apiClient.delete(`/projects/${id}/members/${employeeId}`);
}

export async function deactivateProject(id: string): Promise<void> {
  await apiClient.patch(`/projects/${id}/deactivate`);
}
