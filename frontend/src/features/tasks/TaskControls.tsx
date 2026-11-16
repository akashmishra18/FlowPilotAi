import { useState } from 'react';
import { Button, Select, Textarea } from '@/components/ui';
import { TaskStatusBadge } from './TaskBadges';
import { AssigneeOption, useAssigneeOptions, useEmployeeDirectory } from './hooks';
import { Task, TaskStatus } from './types';
import { TASK_STATUS_META } from './ui';

export function StatusControl({ task, allowed, busy, onChange }: { task: Task; allowed: TaskStatus[]; busy: boolean; onChange: (status: TaskStatus) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <TaskStatusBadge status={task.status} />
      </div>
      {allowed.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Move task to another status">
          {allowed.map((s) => (
            <Button key={s} size="sm" disabled={busy} onClick={() => onChange(s)}>
              {TASK_STATUS_META[s].label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          {task.status === 'COMPLETED' ? 'Completed tasks can only be reopened by a manager or admin.' : 'You cannot change this task’s status.'}
        </p>
      )}
    </div>
  );
}

export function AssigneeControl({ task, busy, onAssign }: { task: Task; busy: boolean; onAssign: (employeeId: string | null) => void }) {
  const { names } = useEmployeeDirectory(true);
  const { options, isLoading, error, reload } = useAssigneeOptions(task.projectId?._id ?? null, names);
  const current = task.assignedTo?._id ?? '';
  const [selected, setSelected] = useState(current);

  // Keep the current assignee selectable even if they are no longer an active member.
  const merged: AssigneeOption[] =
    current && !options.some((o) => o.value === current)
      ? [{ value: current, label: `${task.assignedTo?.userId?.name ?? task.assignedTo?.employeeId} (current)` }, ...options]
      : options;

  return (
    <div>
      <label htmlFor="assignee-select" className="mb-1.5 block text-xs font-medium text-slate-400">
        Assignee
      </label>
      <div className="flex gap-2">
        <Select id="assignee-select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={isLoading || busy}>
          <option value="">Unassigned</option>
          {merged.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button variant="primary" disabled={selected === current || busy} onClick={() => onAssign(selected || null)}>
          Save
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-500">{error ?? (isLoading ? 'Loading project members…' : 'Only active members of the project can be assigned.')}</p>
        {error && <Button size="sm" variant="ghost" onClick={() => void reload()}>Retry</Button>}
      </div>
    </div>
  );
}

export function DescriptionEditor({ value, canEdit, busy, onSave }: { value: string; canEdit: boolean; busy: boolean; onSave: (description: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{value || 'No description provided.'}</p>
        {canEdit && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            Edit description
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="description-editor" className="sr-only">
        Description
      </label>
      <Textarea id="description-editor" rows={6} maxLength={5000} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          isLoading={busy}
          onClick={async () => {
            if (await onSave(draft.trim())) setEditing(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
