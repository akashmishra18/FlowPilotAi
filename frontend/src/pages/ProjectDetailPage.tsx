import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, Pencil, Power, X, UserCog, AlertTriangle } from 'lucide-react';
import {
  getProjectById,
  updateProjectStatus,
  assignManager,
  addMember,
  removeMember,
  deactivateProject,
} from '@/features/projects/projectsApi';
import { Project, ProjectStatus } from '@/features/projects/types';
import { STATUS_META, PRIORITY_META, getStatusDerivedProgress, getInitials, formatDate, darkInputClass } from '@/features/projects/ui';
import EmployeePicker from '@/features/projects/EmployeePicker';
import EditProjectModal from '@/features/projects/EditProjectModal';
import { useAuthStore } from '@/store/authStore';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [newManagerId, setNewManagerId] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getProjectById(id);
      setProject(result);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not load this project.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const canManage = user?.role === 'ADMIN' || (user?.role === 'MANAGER' && user._id === project?.managerId?._id);
  const isAdmin = user?.role === 'ADMIN';

  async function handleStatusChange(status: ProjectStatus) {
    if (!project) return;
    setIsBusy(true);
    setError(null);
    try {
      await updateProjectStatus(project._id, status);
      await fetchProject();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReassign() {
    if (!project || !newManagerId.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      await assignManager(project._id, newManagerId.trim());
      setShowReassign(false);
      setNewManagerId('');
      await fetchProject();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemoveMember(employeeId: string) {
    if (!project) return;
    setIsBusy(true);
    setError(null);
    try {
      await removeMember(project._id, employeeId);
      await fetchProject();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!project) return;
    if (!window.confirm(`Deactivate "${project.name}"?`)) return;
    setIsBusy(true);
    setError(null);
    try {
      await deactivateProject(project._id);
      await fetchProject();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B0F] flex items-center justify-center text-slate-500 text-sm gap-2">
        <LoaderCircle className="w-4 h-4 animate-spin" /> Loading project...
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen bg-[#0A0B0F] px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/projects')} className="text-sm text-slate-500 flex items-center gap-1 mb-4 hover:text-slate-300">
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-3">{error}</div>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const status = STATUS_META[project.status];
  const priority = PRIORITY_META[project.priority];
  const progress = getStatusDerivedProgress(project.status);

  return (
    <div className="min-h-screen bg-[#0A0B0F] px-6 py-8 lg:px-10 lg:py-10">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/projects')} className="text-sm text-slate-500 flex items-center gap-1 mb-6 hover:text-slate-300">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Header */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center font-semibold shrink-0">
                {getInitials(project.name)}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-100">{project.name}</h1>
                <p className="text-xs text-slate-500 mt-0.5">{project.projectCode}</p>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${status.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${priority.badge}`}>
                    {priority.label}
                  </span>
                  {!project.isActive && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs border bg-white/5 text-slate-400 border-white/10">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManage && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 border border-white/10 rounded-lg hover:bg-white/5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {isAdmin && project.isActive && (
                <button
                  onClick={handleDeactivate}
                  disabled={isBusy}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-rose-300 border border-rose-500/20 rounded-lg hover:bg-rose-500/10 disabled:opacity-60"
                >
                  <Power className="w-3.5 h-3.5" /> Deactivate
                </button>
              )}
            </div>
          </div>

          {progress !== null && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full ${status.dot} transition-all duration-500`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main info */}
          <div className="md:col-span-2 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Description</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{project.description || 'No description provided.'}</p>

              <dl className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5 text-sm">
                <Detail label="Client" value={project.clientName || '—'} />
                <Detail label="Start Date" value={formatDate(project.startDate)} />
                <Detail label="End Date" value={formatDate(project.deadline)} />
                <Detail label="Created" value={formatDate(project.createdAt)} />
              </dl>

              {canManage && (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">Change Status</h3>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_META) as ProjectStatus[]).map((s) => (
                      <button
                        key={s}
                        disabled={isBusy || s === project.status}
                        onClick={() => handleStatusChange(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:cursor-default ${
                          s === project.status
                            ? `${STATUS_META[s].badge} cursor-default`
                            : 'border-white/10 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-300">Members ({project.members.length})</h3>
                {canManage && (
                  <button
                    onClick={() => setShowMemberPicker((s) => !s)}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    {showMemberPicker ? 'Close' : '+ Add member'}
                  </button>
                )}
              </div>

              {showMemberPicker && (
                <div className="mb-4">
                  <EmployeePicker
                    excludeIds={project.members.map((m) => m._id)}
                    onPick={async (employee) => {
                      setIsBusy(true);
                      setError(null);
                      try {
                        await addMember(project._id, employee._id);
                        setShowMemberPicker(false);
                        await fetchProject();
                      } catch (err) {
                        setError(getFriendlyErrorMessage(err));
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                  />
                </div>
              )}

              {project.members.length === 0 ? (
                <p className="text-sm text-slate-500">No members assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {project.members.map((member) => (
                    <div
                      key={member._id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="text-sm">
                        <span className="text-slate-200">{member.employeeId}</span>
                        <span className="text-slate-500"> · {member.designation}</span>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => handleRemoveMember(member._id)}
                          disabled={isBusy}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 disabled:opacity-50"
                          aria-label={`Remove ${member.employeeId}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Manager sidebar */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 h-fit">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Manager</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-slate-300">
                {getInitials(project.managerId?.name ?? '?')}
              </div>
              <div className="min-w-0">
                <div className="text-sm text-slate-200 truncate">{project.managerId?.name ?? 'Unassigned'}</div>
                <div className="text-xs text-slate-500 truncate">{project.managerId?.email}</div>
              </div>
            </div>

            {isAdmin && (
              <>
                <button
                  onClick={() => setShowReassign((s) => !s)}
                  className="flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300"
                >
                  <UserCog className="w-3.5 h-3.5" /> {showReassign ? 'Cancel' : 'Reassign manager'}
                </button>

                {showReassign && (
                  <div className="mt-3 space-y-2">
                    <input
                      value={newManagerId}
                      onChange={(e) => setNewManagerId(e.target.value)}
                      placeholder="New manager's User ID"
                      className={darkInputClass}
                    />
                    <button
                      onClick={handleReassign}
                      disabled={isBusy || !newManagerId.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white text-xs font-medium py-2 rounded-lg"
                    >
                      {isBusy && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                      Confirm Reassignment
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onUpdated={() => {
            setShowEditModal(false);
            fetchProject();
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500 text-xs mb-0.5">{label}</dt>
      <dd className="text-slate-200 font-medium">{value}</dd>
    </div>
  );
}
