import { useCallback, useMemo } from 'react';
import { listEmployees } from '@/features/employees/employeesApi';
import { getProjectById, listProjects } from '@/features/projects/projectsApi';
import { useAsyncData } from '@/hooks/useAsyncData';

export interface AssigneeOption {
  /** Employee _id — the value the backend expects for `assignedTo`. */
  value: string;
  label: string;
}

/** Projects the current user can see (the backend scopes the list by role). Capped at one page of 100. */
export function useProjectOptions() {
  const fetcher = useCallback(() => listProjects({ limit: 100 }), []);
  const { data, isLoading, error, reload } = useAsyncData(fetcher, 'Could not load projects.');
  return { projects: data?.projects ?? [], isLoading, error, reload };
}

/**
 * Employees, only for roles allowed to list them. Used for the assignee
 * filter and to show real names (project members arrive without names).
 * Failure is non-fatal: callers fall back to the employee code.
 */
export function useEmployeeDirectory(enabled: boolean) {
  const fetcher = useCallback(() => (enabled ? listEmployees({ limit: 100 }).then((r) => r.employees) : Promise.resolve([])), [enabled]);
  const { data, isLoading, error, reload } = useAsyncData(fetcher, 'Could not load employees.');
  return useMemo(() => {
    const names = new Map<string, string>();
    (data ?? []).forEach((e) => names.set(e._id, e.user?.name ?? e.employeeId));
    return { employees: data ?? [], names, isLoading, error, reload };
  }, [data, error, isLoading, reload]);
}

/** Active members of a project, as assignee options. A task can only be assigned to a project member. */
export function useAssigneeOptions(projectId: string | null, names: Map<string, string>) {
  const fetcher = useCallback(() => (projectId ? getProjectById(projectId) : Promise.resolve(null)), [projectId]);
  const { data, isLoading, error, reload } = useAsyncData(fetcher, 'Could not load project members.');
  const options: AssigneeOption[] = useMemo(
    () =>
      (data?.members ?? [])
        .filter((m) => m.isActive)
        .map((m) => ({ value: m._id, label: `${names.get(m._id) ?? m.employeeId} · ${m.designation}` })),
    [data, names],
  );
  // Never offer the previous project's members while the new project's list is loading.
  return { options: isLoading ? [] : options, isLoading, error, reload };
}
