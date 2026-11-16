import { ProjectStatus } from '@/features/projects/types';

// Mirrors backend/src/config/constants.ts and backend/src/models/Task.ts exactly.
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'BLOCKED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** `assignedTo` as populated by the backend (safe fields only; never credentials). */
export interface TaskAssignee {
  _id: string;
  employeeId: string;
  department: string;
  designation: string;
  isActive: boolean;
  userId: { _id: string; name: string; email: string } | null;
}

export interface TaskProjectSummary {
  _id: string;
  name: string;
  projectCode: string;
  status: ProjectStatus;
  isActive: boolean;
  /** Raw id (the User who manages the project) — used only to mirror ownership checks for UI hints. */
  managerId: string;
}

export interface TaskCreatorSummary {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  /** Null only if the referenced project no longer exists. */
  projectId: TaskProjectSummary | null;
  assignedTo: TaskAssignee | null;
  createdBy: TaskCreatorSummary | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskListFilters {
  page?: number;
  limit?: number;
  projectId?: string;
  assignedTo?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDateFrom?: string;
  dueDateTo?: string;
  overdue?: boolean;
  search?: string;
}

export interface TaskPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TaskListResponse {
  tasks: Task[];
  pagination: TaskPagination;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  tags?: string[];
}

/** projectId and createdBy are immutable — the backend answers 422 if they are sent. */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assignedTo?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  tags?: string[];
}
