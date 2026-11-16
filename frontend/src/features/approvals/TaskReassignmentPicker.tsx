import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, SearchInput } from '@/components/ui';
import { getProjectById } from '@/features/projects/projectsApi';
import { ProjectMemberSummary } from '@/features/projects/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listTasks } from '@/features/tasks/tasksApi';
import { Task, TaskListResponse } from '@/features/tasks/types';
import { TASK_STATUS_META } from '@/features/tasks/ui';

interface TaskReassignmentPickerProps {
  onChange: (taskId: string, assignedTo: string) => void;
}

/** Task results come from the role-scoped task list; assignees come from that task's accessible project. */
export default function TaskReassignmentPicker({ onChange }: TaskReassignmentPickerProps) {
  const [taskQuery, setTaskQuery] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskLoadAttempt, setTaskLoadAttempt] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMemberSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [memberLoadAttempt, setMemberLoadAttempt] = useState(0);
  const debouncedTaskQuery = useDebouncedValue(taskQuery.trim(), 300);

  useEffect(() => {
    let cancelled = false;
    setTaskLoading(true);
    setTaskError(null);
    setTasks([]);
    listTasks({ search: debouncedTaskQuery || undefined, limit: 8 })
      .then((response: TaskListResponse) => {
        if (!cancelled) setTasks(response.tasks);
      })
      .catch(() => {
        if (!cancelled) setTaskError('Could not load tasks you can access. Try changing the search.');
      })
      .finally(() => {
        if (!cancelled) setTaskLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTaskQuery, taskLoadAttempt]);

  useEffect(() => {
    let cancelled = false;
    setMembers([]);
    setMembersError(null);
    setMemberQuery('');
    setSelectedMemberId('');
    if (!selectedTask?.projectId?._id) {
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    getProjectById(selectedTask.projectId._id)
      .then((project) => {
        if (!cancelled) setMembers(project.members.filter((member) => member.isActive && member._id !== selectedTask.assignedTo?._id));
      })
      .catch(() => {
        if (!cancelled) setMembersError('Could not load eligible members for this project.');
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTask, memberLoadAttempt]);

  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return members.filter((member) => `${member.employeeId} ${member.department} ${member.designation}`.toLowerCase().includes(query));
  }, [members, memberQuery]);

  function selectTask(task: Task) {
    setSelectedTask(task);
    setMembers([]);
    setMembersLoading(Boolean(task.projectId?._id));
    setMembersError(null);
    setMemberQuery('');
    setSelectedMemberId('');
    setMemberLoadAttempt((attempt) => attempt + 1);
    onChange(task._id, '');
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      {selectedTask && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-800">Selected task</p>
            <p className="truncate text-sm font-semibold text-slate-900">{selectedTask.title}</p>
            <p className="truncate text-xs text-slate-600">{selectedTask.projectId?.projectCode ?? 'Unknown project'}</p>
          </div>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-brand-700 underline"
            onClick={() => {
              setSelectedTask(null);
              setSelectedMemberId('');
              onChange('', '');
            }}
          >
            Clear
          </button>
        </div>
      )}
      <div>
        <label htmlFor="approval-task-search" className="mb-1.5 block text-sm font-medium text-slate-700">Search tasks you can access</label>
        <SearchInput id="approval-task-search" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="Search task title, description, or tag" />
        {taskError && <Alert tone="error" className="mt-2" action={<Button size="sm" variant="ghost" onClick={() => setTaskLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}>{taskError}</Alert>}
        <ul className="mt-2 max-h-48 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10" aria-busy={taskLoading}>
          {taskLoading ? (
            <li className="px-3 py-3 text-sm text-slate-500">Searching tasks…</li>
          ) : tasks.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">No matching tasks in your accessible scope.</li>
          ) : tasks.map((task) => (
            <li key={task._id}>
              <button
                type="button"
                aria-pressed={selectedTask?._id === task._id}
                onClick={() => selectTask(task)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{task.title}</span>
                  <span className="block truncate text-xs text-slate-500">{task.projectId?.projectCode ?? 'Unknown project'} · {TASK_STATUS_META[task.status].label}</span>
                </span>
                {selectedTask?._id === task._id && <span className="shrink-0 text-xs font-medium text-brand-700">Selected</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedTask && (
        <div>
          <label htmlFor="approval-member-search" className="mb-1.5 block text-sm font-medium text-slate-700">Search active members of {selectedTask.projectId?.name ?? 'the selected project'}</label>
          <SearchInput id="approval-member-search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search employee ID, department, or designation" disabled={membersLoading || Boolean(membersError)} />
          {membersError && (
            <Alert tone="error" className="mt-2" action={<Button size="sm" variant="ghost" onClick={() => setMemberLoadAttempt((attempt) => attempt + 1)}>Retry</Button>}>
              {membersError}
            </Alert>
          )}
          <ul className="mt-2 max-h-40 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10" aria-busy={membersLoading}>
            {membersLoading ? (
              <li className="px-3 py-3 text-sm text-slate-500">Loading project members…</li>
            ) : membersError ? null : filteredMembers.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">No eligible active members found.</li>
            ) : filteredMembers.map((member) => (
              <li key={member._id}>
                <button
                  type="button"
                  aria-pressed={selectedMemberId === member._id}
                  onClick={() => {
                    setSelectedMemberId(member._id);
                    onChange(selectedTask._id, member._id);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{member.employeeId}</span>
                    <span className="block truncate text-xs text-slate-500">{member.designation} · {member.department}</span>
                  </span>
                  {selectedMemberId === member._id && <span className="shrink-0 text-xs font-medium text-brand-700">Selected</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
