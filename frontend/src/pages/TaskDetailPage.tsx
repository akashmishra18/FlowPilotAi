import { ReactNode, useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lock, Pencil, SearchX, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeading, ConfirmDialog, EmptyState, PageHeader, Skeleton, buttonClasses } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { parseApiError } from '@/services/errorHelpers';
import { deleteTask, getTaskById, updateTask } from '@/features/tasks/tasksApi';
import { Task, UpdateTaskInput } from '@/features/tasks/types';
import { TaskPriorityBadge } from '@/features/tasks/TaskBadges';
import { AssigneeControl, DescriptionEditor, StatusControl } from '@/features/tasks/TaskControls';
import TaskFormModal from '@/features/tasks/TaskFormModal';
import { assigneeName, formatDueDate, getTaskPermissions, isOverdue } from '@/features/tasks/ui';

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-slate-100">{children}</dd>
    </div>
  );
}

const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function TaskDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const fetcher = useCallback(() => getTaskById(id), [id]);
  const { data: loaded, error, errorStatus, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load this task.');

  // Mutations return the freshly populated task; keep it locally so we don't refetch after every action.
  const [local, setLocal] = useState<Task | null>(null);
  const task = local && local._id === id ? local : loaded;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const apply = useCallback(
    async (input: UpdateTaskInput, success: string): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      try {
        setLocal(await updateTask(id, input));
        toast.success(success);
        return true;
      } catch (err) {
        // The backend is authoritative: a 403 here means the UI offered something the server refused.
        setActionError(parseApiError(err, 'Could not update the task.').message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id],
  );

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteTask(id);
      toast.success('Task deleted.');
      navigate('/tasks', { replace: true });
    } catch (err) {
      setShowDelete(false);
      setActionError(parseApiError(err, 'Could not delete the task.').message);
    } finally {
      setBusy(false);
    }
  }

  if (isInitialLoading && !task) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading task" className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!task) {
    const back = (
      <Link to="/tasks" className={buttonClasses({ variant: 'secondary' })}>
        Back to tasks
      </Link>
    );
    if (errorStatus === 404) return <EmptyState icon={SearchX} title="Task not found" description="It may have been deleted, or the link is wrong." action={back} />;
    if (errorStatus === 403) return <EmptyState icon={Lock} title="You don't have access to this task" description="Tasks are only visible to admins, the project's manager and the assignee." action={back} />;
    return (
      <Alert
        tone="error"
        title="Couldn't load this task"
        action={
          <Button size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  const perms = getTaskPermissions(user, task);
  const overdue = isOverdue(task);

  return (
    <div>
      <PageHeader
        back={{ to: '/tasks', label: 'Back to tasks' }}
        title={task.title}
        badge={<TaskPriorityBadge priority={task.priority} />}
        actions={
          <>
            {perms.canManage && (
              <Button size="sm" onClick={() => setShowEdit(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
              </Button>
            )}
            {perms.canDelete && (
              <Button size="sm" variant="danger" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
              </Button>
            )}
          </>
        }
      />

      {actionError && (
        <Alert tone="error" title="That didn't work" className="mb-4">
          {actionError}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeading title="Description" />
            <DescriptionEditor key={task.updatedAt} value={task.description} canEdit={perms.canEditDescription} busy={busy} onSave={(description) => apply({ description }, 'Description updated.')} />
          </Card>

          <Card>
            <CardHeading title="Status" description={perms.canManage ? 'Managers and admins can move a task to any status.' : undefined} />
            <StatusControl task={task} allowed={perms.allowedStatuses} busy={busy} onChange={(status) => void apply({ status }, `Moved to ${status.toLowerCase().replace('_', ' ')}.`)} />
          </Card>

          {perms.canManage && (
            <Card>
              <CardHeading
                title="Assignment"
                description="Direct assignment takes effect immediately. Use Approvals to submit a separate request for review."
                action={<Link to="/approvals" className="text-xs font-medium text-brand-700 hover:text-brand-800">Request review</Link>}
              />
              <AssigneeControl key={task.assignedTo?._id ?? 'none'} task={task} busy={busy} onAssign={(employeeId) => void apply({ assignedTo: employeeId }, employeeId ? 'Task assigned.' : 'Task unassigned.')} />
            </Card>
          )}

          {!perms.canManage && !perms.isAssignee && <Alert tone="info">You can view this task but not change it.</Alert>}
        </div>

        <Card className="h-fit">
          <CardHeading title="Details" />
          <dl className="divide-y divide-white/5">
            <Meta label="Project">
              {task.projectId ? (
                <Link to={`/projects/${task.projectId._id}`} className="text-brand-300 hover:text-brand-200">
                  {task.projectId.projectCode} — {task.projectId.name}
                </Link>
              ) : (
                '—'
              )}
            </Meta>
            <Meta label="Assignee">{assigneeName(task)}</Meta>
            <Meta label="Due">
              <span className={overdue ? 'font-medium text-rose-300' : undefined}>
                {formatDueDate(task.dueDate)}
                {overdue && ' (overdue)'}
              </span>
            </Meta>
            <Meta label="Tags">
              {task.tags.length > 0 ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {task.tags.map((t) => (
                    <Badge key={t}>#{t}</Badge>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </Meta>
            <Meta label="Created by">{task.createdBy?.name ?? '—'}</Meta>
            <Meta label="Created">{dateTime(task.createdAt)}</Meta>
            <Meta label="Updated">{dateTime(task.updatedAt)}</Meta>
            {task.completedAt && <Meta label="Completed">{dateTime(task.completedAt)}</Meta>}
          </dl>
        </Card>
      </div>

      {showEdit && (
        <TaskFormModal
          task={task}
          onClose={() => setShowEdit(false)}
          onSaved={(saved) => {
            setLocal(saved);
            setShowEdit(false);
          }}
        />
      )}

      {showDelete && (
        <ConfirmDialog
          title="Delete this task?"
          message={`"${task.title}" will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete task"
          isLoading={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
