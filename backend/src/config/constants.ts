/**
 * Central enums. Using `as const` objects (not raw strings scattered through
 * the codebase, and not TS `enum` which doesn't serialize as cleanly to/from
 * Mongo) so every layer — models, RBAC middleware, JWT payloads, and later
 * the AI tool registry — references the same fixed set of values.
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEAM_LEAD: 'TEAM_LEAD',
  EMPLOYEE: 'EMPLOYEE',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_VALUES = Object.values(ROLES);

/**
 * Role hierarchy for reference/UI only — the RBAC middleware itself uses
 * explicit allow-lists (`requireRole('ADMIN', 'MANAGER')`) rather than a
 * numeric hierarchy comparison, so every protected route's allowed roles
 * are visible directly at the route definition instead of implied by rank.
 */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 4,
  MANAGER: 3,
  TEAM_LEAD: 2,
  EMPLOYEE: 1,
};

export const PROJECT_STATUS = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];
export const PROJECT_STATUS_VALUES = Object.values(PROJECT_STATUS);

export const PROJECT_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type ProjectPriority = (typeof PROJECT_PRIORITY)[keyof typeof PROJECT_PRIORITY];
export const PROJECT_PRIORITY_VALUES = Object.values(PROJECT_PRIORITY);

export const TASK_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];
export const TASK_PRIORITY_VALUES = Object.values(TASK_PRIORITY);

export const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
} as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export const TASK_STATUS_VALUES = Object.values(TASK_STATUS);

/**
 * Status transitions an assignee (a plain EMPLOYEE/TEAM_LEAD working their
 * own task) may make. Notably an assignee can submit work for REVIEW but can
 * never mark it COMPLETED themselves — that sign-off belongs to the project's
 * manager or an ADMIN, who may move a task to any status.
 */
export const ASSIGNEE_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['TODO', 'REVIEW', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS'],
  REVIEW: ['IN_PROGRESS'],
  COMPLETED: [],
};
