import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Alert, Button, Card, Input, SearchInput, Select } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Project } from '@/features/projects/types';
import { TASK_PRIORITIES, TASK_STATUSES, TaskListFilters } from './types';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './ui';

interface TaskFiltersProps {
  filters: TaskListFilters;
  projects: Project[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  onRetryProjects?: () => void;
  /** Present only for roles allowed to filter by assignee (ADMIN/MANAGER). */
  assignees?: { value: string; label: string }[];
  assigneesLoading?: boolean;
  assigneesError?: string | null;
  onRetryAssignees?: () => void;
  onChange: (key: keyof TaskListFilters, value: string | boolean | undefined) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const labelClass = 'mb-1 block text-xs font-medium text-slate-400';

export default function TaskFilters({ filters, projects, projectsLoading, projectsError, onRetryProjects, assignees, assigneesLoading, assigneesError, onRetryAssignees, onChange, onClear, hasActiveFilters }: TaskFiltersProps) {
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(filters.assignedTo || filters.priority || filters.dueDateFrom || filters.dueDateTo));
  const debounced = useDebouncedValue(searchText, 350);
  const advancedFilterCount = Number(Boolean(filters.assignedTo)) + Number(Boolean(filters.priority)) + Number(Boolean(filters.dueDateFrom)) + Number(Boolean(filters.dueDateTo));

  // Push the debounced text into the URL-backed filters.
  useEffect(() => {
    if ((filters.search ?? '') !== debounced.trim()) onChange('search', debounced.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Keep the box in sync when filters are cleared or changed externally (e.g. a dashboard link).
  useEffect(() => {
    setSearchText(filters.search ?? '');
  }, [filters.search]);

  useEffect(() => {
    if (advancedFilterCount > 0) setAdvancedOpen(true);
  }, [advancedFilterCount]);

  return (
    <Card className="mb-6">
      {projectsError && <Alert tone="error" title="Project filter unavailable" className="mb-3" action={onRetryProjects && <Button size="sm" variant="ghost" onClick={onRetryProjects}>Retry</Button>}>{projectsError}</Alert>}
      {assignees && assigneesError && <Alert tone="error" title="Assignee filter unavailable" className="mb-3" action={onRetryAssignees && <Button size="sm" variant="ghost" onClick={onRetryAssignees}>Retry</Button>}>{assigneesError}</Alert>}
      <form role="search" aria-label="Filter tasks" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="task-search" className={labelClass}>
              Search
            </label>
            <SearchInput id="task-search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Title, description or tag" maxLength={100} />
          </div>
          <div>
            <label htmlFor="task-project" className={labelClass}>
              Project
            </label>
            <Select id="task-project" value={filters.projectId ?? ''} disabled={projectsLoading || Boolean(projectsError)} onChange={(e) => onChange('projectId', e.target.value || undefined)}>
              <option value="">{projectsLoading ? 'Loading projects…' : projectsError ? 'Unavailable' : 'All projects'}</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.projectCode} — {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="task-status" className={labelClass}>
              Status
            </label>
            <Select id="task-status" value={filters.status ?? ''} onChange={(e) => onChange('status', e.target.value || undefined)}>
              <option value="">All statuses</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={filters.overdue === true}
                onChange={(e) => onChange('overdue', e.target.checked ? true : undefined)}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              Overdue only
            </label>
            <details className="group" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
                More filters{advancedFilterCount > 0 ? ` (${advancedFilterCount} active)` : ''}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {assignees && (
                  <div>
                    <label htmlFor="task-assignee" className={labelClass}>Assignee</label>
                    <Select id="task-assignee" value={filters.assignedTo ?? ''} disabled={assigneesLoading || Boolean(assigneesError)} onChange={(e) => onChange('assignedTo', e.target.value || undefined)}>
                      <option value="">{assigneesLoading ? 'Loading employees…' : assigneesError ? 'Unavailable' : 'Anyone'}</option>
                      {assignees.map((assignee) => <option key={assignee.value} value={assignee.value}>{assignee.label}</option>)}
                    </Select>
                  </div>
                )}
                <div>
                  <label htmlFor="task-priority" className={labelClass}>Priority</label>
                  <Select id="task-priority" value={filters.priority ?? ''} onChange={(e) => onChange('priority', e.target.value || undefined)}>
                    <option value="">All priorities</option>
                    {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{TASK_PRIORITY_META[priority].label}</option>)}
                  </Select>
                </div>
                <div>
                  <label htmlFor="task-due-from" className={labelClass}>Due from</label>
                  <Input id="task-due-from" type="date" value={filters.dueDateFrom ?? ''} onChange={(e) => onChange('dueDateFrom', e.target.value || undefined)} />
                </div>
                <div>
                  <label htmlFor="task-due-to" className={labelClass}>Due to</label>
                  <Input id="task-due-to" type="date" value={filters.dueDateTo ?? ''} onChange={(e) => onChange('dueDateTo', e.target.value || undefined)} />
                </div>
              </div>
            </details>
          </div>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
