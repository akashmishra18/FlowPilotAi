import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, Plus, RefreshCw } from 'lucide-react';
import { Alert, Button, EmptyState, PageHeader, Pagination } from '@/components/ui';
import RoleGate from '@/components/RoleGate';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useAuthStore } from '@/store/authStore';
import { listTasks } from '@/features/tasks/tasksApi';
import { useEmployeeDirectory, useProjectOptions } from '@/features/tasks/hooks';
import { TASK_PRIORITIES, TASK_STATUSES, TaskListFilters, TaskListResponse } from '@/features/tasks/types';
import TaskFilters from '@/features/tasks/TaskFilters';
import TaskList, { TaskListSkeleton } from '@/features/tasks/TaskList';
import TaskFormModal from '@/features/tasks/TaskFormModal';

const PAGE_SIZE = 12;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Filters live in the URL (shareable, back-button friendly, linkable from the dashboard). Anything invalid is ignored. */
function parseFilters(params: URLSearchParams): TaskListFilters {
  const status = params.get('status');
  const priority = params.get('priority');
  const projectId = params.get('projectId');
  const assignedTo = params.get('assignedTo');
  const from = params.get('dueDateFrom');
  const to = params.get('dueDateTo');
  const page = Number(params.get('page'));
  const search = params.get('search')?.trim().slice(0, 100);

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    status: TASK_STATUSES.find((s) => s === status),
    priority: TASK_PRIORITIES.find((p) => p === priority),
    projectId: projectId && OBJECT_ID.test(projectId) ? projectId : undefined,
    assignedTo: assignedTo && OBJECT_ID.test(assignedTo) ? assignedTo : undefined,
    dueDateFrom: from && DATE_ONLY.test(from) ? from : undefined,
    dueDateTo: to && DATE_ONLY.test(to) ? to : undefined,
    overdue: params.get('overdue') === 'true' ? true : undefined,
    search: search || undefined,
  };
}

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [showCreate, setShowCreate] = useState(false);

  const query = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);

  const { projects, isLoading: projectsLoading, error: projectsError, reload: reloadProjects } = useProjectOptions();
  const { employees, isLoading: employeesLoading, error: employeesError, reload: reloadEmployees } = useEmployeeDirectory(isStaff);
  const assigneeOptions = useMemo(() => (isStaff ? employees.map((e) => ({ value: e._id, label: e.user?.name ?? e.employeeId })) : undefined), [isStaff, employees]);

  const fetcher = useCallback(
    (): Promise<TaskListResponse> =>
      listTasks({
        ...filters,
        limit: PAGE_SIZE,
        // Date inputs are calendar dates; make the range inclusive of both end days (UTC, matching how due dates are stored).
        dueDateFrom: filters.dueDateFrom ? `${filters.dueDateFrom}T00:00:00.000Z` : undefined,
        dueDateTo: filters.dueDateTo ? `${filters.dueDateTo}T23:59:59.999Z` : undefined,
      }),
    [filters],
  );
  const { data, error, isLoading, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load tasks.');

  const updateFilter = useCallback(
    (key: keyof TaskListFilters, value: string | boolean | undefined) => {
      const next = new URLSearchParams(query);
      if (value === undefined || value === '' || value === false) next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      setParams(next, { replace: true });
    },
    [query, setParams],
  );

  const clearFilters = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const hasActiveFilters = Boolean(filters.status || filters.priority || filters.projectId || filters.assignedTo || filters.dueDateFrom || filters.dueDateTo || filters.overdue || filters.search);

  const description = isStaff ? (user?.role === 'ADMIN' ? 'Every task across all projects.' : 'Tasks in the projects you manage.') : 'Tasks assigned to you.';

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={data ? `${description} ${data.pagination.total} found.` : description}
        actions={
          <>
            <Button size="sm" onClick={() => void reload()} isLoading={isLoading && !isInitialLoading} aria-label="Refresh tasks">
              {!(isLoading && !isInitialLoading) && <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Refresh
            </Button>
            <RoleGate allow={['ADMIN', 'MANAGER']}>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> New task
              </Button>
            </RoleGate>
          </>
        }
      />

      <TaskFilters
        filters={filters}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        onRetryProjects={() => void reloadProjects()}
        assignees={assigneeOptions}
        assigneesLoading={employeesLoading}
        assigneesError={employeesError}
        onRetryAssignees={() => void reloadEmployees()}
        onChange={updateFilter}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {error && (
        <Alert
          tone="error"
          title="Couldn't load tasks"
          className="mb-4"
          action={
            <Button size="sm" onClick={() => void reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {isInitialLoading && !data ? (
        <TaskListSkeleton />
      ) : data && data.tasks.length > 0 ? (
        <div aria-busy={isLoading} className={isLoading ? 'opacity-60 transition-opacity' : undefined}>
          <TaskList tasks={data.tasks} />
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} onChange={(p) => updateFilter('page', p === 1 ? undefined : String(p))} />
        </div>
      ) : !error && data ? (
        <EmptyState
          icon={CheckSquare}
          title={hasActiveFilters ? 'No tasks match your filters' : 'No tasks yet'}
          description={hasActiveFilters ? 'Try removing a filter or searching for something else.' : isStaff ? 'Create the first task to start tracking work.' : 'Tasks assigned to you will appear here.'}
          action={
            hasActiveFilters ? (
              <Button onClick={clearFilters}>Clear filters</Button>
            ) : (
              <RoleGate allow={['ADMIN', 'MANAGER']}>
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> New task
                </Button>
              </RoleGate>
            )
          }
        />
      ) : null}

      {showCreate && (
        <TaskFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}
