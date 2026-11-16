import { apiClient } from '@/services/apiClient';
import { CreateTaskInput, Task, TaskListFilters, TaskListResponse, UpdateTaskInput } from './types';

export async function listTasks(filters: TaskListFilters = {}): Promise<TaskListResponse> {
  const params: Record<string, string> = {};
  if (filters.page) params.page = String(filters.page);
  if (filters.limit) params.limit = String(filters.limit);
  if (filters.projectId) params.projectId = filters.projectId;
  if (filters.assignedTo) params.assignedTo = filters.assignedTo;
  if (filters.status) params.status = filters.status;
  if (filters.priority) params.priority = filters.priority;
  if (filters.dueDateFrom) params.dueDateFrom = filters.dueDateFrom;
  if (filters.dueDateTo) params.dueDateTo = filters.dueDateTo;
  if (typeof filters.overdue === 'boolean') params.overdue = String(filters.overdue);
  if (filters.search) params.search = filters.search;

  const res = await apiClient.get('/tasks', { params });
  return res.data.data as TaskListResponse;
}

export async function getTaskById(id: string): Promise<Task> {
  const res = await apiClient.get(`/tasks/${id}`);
  return res.data.data.task as Task;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const res = await apiClient.post('/tasks', input);
  return res.data.data.task as Task;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const res = await apiClient.patch(`/tasks/${id}`, input);
  return res.data.data.task as Task;
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}
