import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckSquare, Lock, Pencil, Power, SearchX, UserCog, X } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, CardHeading, ConfirmDialog, EmptyState, Field, PageHeader, Skeleton, buttonClasses } from '@/components/ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { parseApiError } from '@/services/errorHelpers';
import { getProjectById, updateProjectStatus, assignManager, addMember, removeMember, deactivateProject } from '@/features/projects/projectsApi';
import { ProjectStatus } from '@/features/projects/types';
import { STATUS_META, PRIORITY_META, formatDate } from '@/features/projects/ui';
import EmployeePicker from '@/features/projects/EmployeePicker';
import ManagerPicker from '@/features/projects/ManagerPicker';
import EditProjectModal from '@/features/projects/EditProjectModal';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);

  const fetcher = useCallback(() => getProjectById(id), [id]);
  const { data: project, error, errorStatus, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load this project.');

  const [showEdit, setShowEdit] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [newManagerId, setNewManagerId] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Every mutation returns an unpopulated record, so refetch afterwards to render manager/member details.
  async function run(action: () => Promise<void>, success: string): Promise<boolean> {
    setIsBusy(true);
    setActionError(null);
    try {
      await action();
      toast.success(success);
      await reload();
      return true;
    } catch (err) {
      setActionError(parseApiError(err, 'That action could not be completed.').message);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  const back = (
    <Link to="/projects" className={buttonClasses({ variant: 'secondary' })}>
      Back to projects
    </Link>
  );

  if (isInitialLoading && !project) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading project" className="space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!project) {
    if (errorStatus === 404) return <EmptyState icon={SearchX} title="Project not found" action={back} />;
    if (errorStatus === 403) return <EmptyState icon={Lock} title="You don't have access to this project" description="Projects are visible to admins, their manager and their members." action={back} />;
    return (
      <Alert
        tone="error"
        title="Couldn't load this project"
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

  // UI hints mirroring backend rules; the API remains the authority.
  const isAdmin = user?.role === 'ADMIN';
  const canManage = isAdmin || (user?.role === 'MANAGER' && user._id === project.managerId?._id);

  const status = STATUS_META[project.status];
  const priority = PRIORITY_META[project.priority];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        back={{ to: '/projects', label: 'Back to projects' }}
        title={project.name}
        description={project.projectCode}
        badge={
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${status.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${priority.badge}`}>{priority.label}</span>
            {!project.isActive && <Badge>Inactive</Badge>}
          </>
        }
        actions={
          <>
            <Link to={`/tasks?projectId=${project._id}`} className={buttonClasses({ size: 'sm' })}>
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" /> View tasks
            </Link>
            {canManage && (
              <Button size="sm" onClick={() => setShowEdit(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
              </Button>
            )}
            {isAdmin && project.isActive && (
              <Button size="sm" variant="danger" onClick={() => setConfirmDeactivate(true)}>
                <Power className="h-3.5 w-3.5" aria-hidden="true" /> Deactivate
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

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeading title="Overview" />
            <p className="text-sm leading-relaxed text-slate-300">{project.description || 'No description provided.'}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-5">
              <Detail label="Client" value={project.clientName || '—'} />
              <Detail label="Start date" value={formatDate(project.startDate)} />
              <Detail label="End date" value={formatDate(project.deadline)} />
              <Detail label="Created" value={formatDate(project.createdAt)} />
            </dl>

            {canManage && (
              <div className="mt-5 border-t border-white/5 pt-5">
                <h3 className="mb-2 text-sm font-medium text-slate-300">Change status</h3>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Change project status">
                  {(Object.keys(STATUS_META) as ProjectStatus[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === project.status ? 'primary' : 'secondary'}
                      aria-pressed={s === project.status}
                      disabled={isBusy || s === project.status}
                      onClick={() => void run(() => updateProjectStatus(project._id, s), 'Status updated.')}
                    >
                      {STATUS_META[s].label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeading
              title={`Members (${project.members.length})`}
              description="Only active project members can be assigned to tasks."
              action={
                canManage ? (
                  <Button size="sm" variant="ghost" onClick={() => setShowMemberPicker((s) => !s)}>
                    {showMemberPicker ? 'Close' : 'Add member'}
                  </Button>
                ) : undefined
              }
            />
            {showMemberPicker && (
              <div className="mb-4">
                <EmployeePicker
                  excludeIds={project.members.map((m) => m._id)}
                  onPick={(employee) => {
                    setShowMemberPicker(false);
                    void run(() => addMember(project._id, employee._id), 'Member added.');
                  }}
                />
              </div>
            )}
            {project.members.length === 0 ? (
              <p className="text-sm text-slate-400">No members assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {project.members.map((member) => (
                  <li key={member._id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                    <span className="text-sm">
                      <span className="text-slate-100">{member.employeeId}</span>
                      <span className="text-slate-400"> · {member.designation}</span>
                      {!member.isActive && <Badge className="ml-2">Inactive</Badge>}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void run(() => removeMember(project._id, member._id), 'Member removed.')}
                        disabled={isBusy}
                        aria-label={`Remove ${member.employeeId} from project`}
                        className="rounded p-1 text-slate-400 hover:text-rose-300 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeading title="Manager" />
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={project.managerId?.name ?? '?'} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-100">{project.managerId?.name ?? 'Unassigned'}</p>
              <p className="truncate text-xs text-slate-400">{project.managerId?.email}</p>
            </div>
          </div>

          {isAdmin && (
            <>
              <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => {
                if (showReassign) setNewManagerId('');
                setShowReassign((s) => !s);
              }}>
                <UserCog className="h-3.5 w-3.5" aria-hidden="true" /> {showReassign ? 'Cancel' : 'Reassign manager'}
              </Button>
              {showReassign && (
                <div className="mt-3 space-y-2">
                  <Field label="New project manager" hint="Choose an active manager/admin linked to an employee record. The signed-in admin is also available.">
                    {() => <ManagerPicker value={newManagerId} onChange={setNewManagerId} />}
                  </Field>
                  <Button
                    variant="primary"
                    className="w-full"
                    isLoading={isBusy}
                    disabled={!newManagerId.trim()}
                    onClick={async () => {
                      const succeeded = await run(() => assignManager(project._id, newManagerId.trim()), 'Manager reassigned.');
                      if (succeeded) {
                        setShowReassign(false);
                        setNewManagerId('');
                      }
                    }}
                  >
                    Confirm reassignment
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {showEdit && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEdit(false)}
          onUpdated={() => {
            setShowEdit(false);
            void reload();
          }}
        />
      )}
      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate this project?"
          message={`"${project.name}" will be marked inactive. There is no way to reactivate a project from the app yet.`}
          confirmLabel="Deactivate"
          isLoading={isBusy}
          onConfirm={async () => {
            await run(() => deactivateProject(project._id), 'Project deactivated.');
            setConfirmDeactivate(false);
          }}
          onCancel={() => setConfirmDeactivate(false)}
        />
      )}
    </div>
  );
}
