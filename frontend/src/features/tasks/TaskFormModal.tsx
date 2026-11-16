import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';
import { createTask, updateTask } from './tasksApi';
import { useAssigneeOptions, useEmployeeDirectory, useProjectOptions } from './hooks';
import { Task, TASK_PRIORITIES, TaskPriority } from './types';
import { TASK_PRIORITY_META, toDateInputValue, toDueDateIso } from './ui';

interface TaskFormModalProps {
  /** Present = edit mode (title/description/priority/due date/tags only; projectId is immutable). */
  task?: Task;
  onClose: () => void;
  onSaved: (task: Task) => void;
}

interface Values {
  title: string;
  description: string;
  projectId: string;
  assignedTo: string;
  priority: TaskPriority;
  dueDate: string;
  tags: string;
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function validate(values: Values, isEdit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.title.trim()) errors.title = 'Title is required.';
  else if (values.title.trim().length > 200) errors.title = 'Title must be 200 characters or fewer.';
  if (!isEdit && !values.projectId) errors.projectId = 'Choose a project.';
  const tags = parseTags(values.tags);
  if (tags.length > 10) errors.tags = 'Use at most 10 tags.';
  else if (tags.some((t) => t.length > 30)) errors.tags = 'Each tag must be 30 characters or fewer.';
  return errors;
}

export default function TaskFormModal({ task, onClose, onSaved }: TaskFormModalProps) {
  const isEdit = Boolean(task);
  const [values, setValues] = useState<Values>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    projectId: task?.projectId?._id ?? '',
    assignedTo: '',
    priority: task?.priority ?? 'MEDIUM',
    dueDate: toDateInputValue(task?.dueDate ?? null),
    tags: task?.tags.join(', ') ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { projects, isLoading: projectsLoading, error: projectsError, reload: reloadProjects } = useProjectOptions();
  // Creating requires ADMIN/MANAGER, both of whom may list employees for real names.
  const { names } = useEmployeeDirectory(!isEdit);
  const { options: assignees, isLoading: assigneesLoading, error: assigneesError, reload: reloadAssignees } = useAssigneeOptions(!isEdit && values.projectId ? values.projectId : null, names);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate(values, isEdit);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    try {
      const common = {
        title: values.title.trim(),
        description: values.description.trim(),
        priority: values.priority,
        dueDate: toDueDateIso(values.dueDate),
        tags: parseTags(values.tags),
      };
      const saved = task
        ? await updateTask(task._id, common)
        : await createTask({ ...common, projectId: values.projectId, assignedTo: values.assignedTo || null });
      toast.success(task ? 'Task updated.' : 'Task created.');
      onSaved(saved);
    } catch (err) {
      const parsed = parseApiError(err, 'Could not save the task.');
      if (parsed.status === 422 && Object.keys(parsed.fieldErrors).length > 0) {
        const mapped: Record<string, string> = {};
        for (const [field, message] of Object.entries(parsed.fieldErrors)) {
          mapped[field.startsWith('tags') ? 'tags' : field] = message;
        }
        setErrors(mapped);
        setFormError('Please fix the highlighted fields.');
      } else {
        setFormError(parsed.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'Edit task' : 'New task'}
      description={isEdit ? 'Update the details of this task.' : 'Create a task and optionally assign it to a project member.'}
      onClose={onClose}
      size="lg"
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      {projectsError && <Alert tone="error" title="Projects unavailable" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => void reloadProjects()}>Retry</Button>}>{projectsError}</Alert>}
      {assigneesError && <Alert tone="error" title="Project members unavailable" className="mb-4" action={<Button size="sm" variant="ghost" onClick={() => void reloadAssignees()}>Retry</Button>}>{assigneesError}</Alert>}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Title" required error={errors.title}>
          {(c) => <Input {...c} value={values.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Fix multiplayer crash on join" />}
        </Field>

        <Field label="Description" error={errors.description}>
          {(c) => <Textarea {...c} value={values.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>

        {!isEdit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required error={errors.projectId} hint={projectsLoading ? 'Loading projects…' : projectsError ? 'Use Retry above to load projects.' : undefined}>
              {(c) => (
                <Select
                  {...c}
                  value={values.projectId}
                  disabled={projectsLoading || Boolean(projectsError)}
                  onChange={(e) => {
                    set('projectId', e.target.value);
                    set('assignedTo', '');
                  }}
                >
                  <option value="">Select a project</option>
                  {projects
                    .filter((p) => p.isActive)
                    .map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.projectCode} — {p.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>

            <Field
              label="Assignee"
              error={errors.assignedTo}
              hint={
                !values.projectId
                  ? 'Choose a project first. Only active project members can be assigned.'
                  : assigneesError
                    ? 'Use Retry above to load project members.'
                  : assigneesLoading
                    ? 'Loading members…'
                    : assignees.length === 0
                      ? 'This project has no active members yet.'
                      : undefined
              }
            >
              {(c) => (
                <Select {...c} value={values.assignedTo} disabled={!values.projectId || assigneesLoading || Boolean(assigneesError)} onChange={(e) => set('assignedTo', e.target.value)}>
                  <option value="">{!values.projectId ? 'Choose a project first' : assigneesLoading ? 'Loading members…' : assigneesError ? 'Unavailable' : 'Unassigned'}</option>
                  {assignees.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority" error={errors.priority}>
            {(c) => (
              <Select {...c} value={values.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_META[p].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date" error={errors.dueDate}>
            {(c) => <Input {...c} type="date" value={values.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
          </Field>
        </div>

        <Field label="Tags" error={errors.tags} hint="Comma-separated, up to 10 (e.g. bug, multiplayer).">
          {(c) => <Input {...c} value={values.tags} onChange={(e) => set('tags', e.target.value)} />}
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            {isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
