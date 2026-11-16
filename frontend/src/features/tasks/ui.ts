import { BadgeTone } from '@/components/ui';
import { CurrentUser } from '@/store/authStore';
import { Task, TaskPriority, TaskStatus } from './types';

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  TODO: { label: 'To do', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'cyan' },
  REVIEW: { label: 'In review', tone: 'violet' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
};

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; tone: BadgeTone }> = {
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

/**
 * Status moves an *assignee* may make — copied from the backend's
 * ASSIGNEE_TASK_TRANSITIONS so the UI only offers moves that can succeed.
 * Admins and the project's manager may move a task to any status. This is a
 * convenience for the UI only: the backend validates every transition.
 */
export const ASSIGNEE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['TODO', 'REVIEW', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS'],
  REVIEW: ['IN_PROGRESS'],
  COMPLETED: [],
};

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, now: Date = new Date()): boolean {
  return Boolean(task.dueDate) && task.status !== 'COMPLETED' && new Date(task.dueDate as string) < now;
}

/**
 * Due dates are calendar dates, not moments in time. They are saved at
 * 12:00 UTC (see toDueDateIso) and always displayed in UTC so the same date
 * shows for everyone regardless of their timezone.
 */
export function formatDueDate(value: string | null): string {
  if (!value) return 'No due date';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** 'YYYY-MM-DD' from a date input -> ISO timestamp at noon UTC (null for empty). */
export function toDueDateIso(dateInput: string): string | null {
  return dateInput ? `${dateInput}T12:00:00.000Z` : null;
}

/** ISO timestamp -> 'YYYY-MM-DD' for a date input. */
export function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export function assigneeName(task: Pick<Task, 'assignedTo'>): string {
  if (!task.assignedTo) return 'Unassigned';
  return task.assignedTo.userId?.name ?? task.assignedTo.employeeId;
}

export interface TaskPermissions {
  /** Edit title/priority/due date/tags, assign, change to any status, delete. */
  canManage: boolean;
  /** The assigned employee: description + limited status moves only. */
  isAssignee: boolean;
  canEditDescription: boolean;
  /** Statuses this user is offered as next steps. */
  allowedStatuses: TaskStatus[];
  canDelete: boolean;
}

/**
 * Mirrors the backend's authorization to decide which controls to *show*.
 * It is not a security boundary — the API re-checks everything and any
 * rejection (403/422) is surfaced to the user.
 */
export function getTaskPermissions(user: CurrentUser | null, task: Task): TaskPermissions {
  const none: TaskPermissions = { canManage: false, isAssignee: false, canEditDescription: false, allowedStatuses: [], canDelete: false };
  if (!user) return none;

  const isAdmin = user.role === 'ADMIN';
  const managesProject = user.role === 'MANAGER' && task.projectId?.managerId === user._id;
  const canManage = isAdmin || managesProject;
  const isAssignee = !canManage && task.assignedTo?.userId?._id === user._id;

  if (canManage) {
    return {
      canManage: true,
      isAssignee: false,
      canEditDescription: true,
      allowedStatuses: (Object.keys(TASK_STATUS_META) as TaskStatus[]).filter((s) => s !== task.status),
      // The backend additionally limits deleting COMPLETED tasks to admins.
      canDelete: isAdmin || task.status !== 'COMPLETED',
    };
  }
  if (isAssignee) {
    return { ...none, isAssignee: true, canEditDescription: true, allowedStatuses: ASSIGNEE_TRANSITIONS[task.status] };
  }
  return none;
}
