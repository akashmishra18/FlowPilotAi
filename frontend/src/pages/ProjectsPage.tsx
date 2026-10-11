import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, ChevronLeft, ChevronRight, FolderKanban, AlertTriangle } from 'lucide-react';
import RoleGate from '@/components/RoleGate';
import { listProjects, deactivateProject } from '@/features/projects/projectsApi';
import { Project, ProjectPagination } from '@/features/projects/types';
import { darkInputClass } from '@/features/projects/ui';
import ProjectCard from '@/features/projects/ProjectCard';
import ProjectCardSkeleton from '@/features/projects/ProjectCardSkeleton';
import CreateProjectModal from '@/features/projects/CreateProjectModal';
import EditProjectModal from '@/features/projects/EditProjectModal';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<ProjectPagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const hasActiveFilters = Boolean(search || status || priority);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listProjects({
        page,
        limit: 9,
        search: search || undefined,
        status: (status || undefined) as never,
        priority: (priority || undefined) as never,
      });
      setProjects(result.projects);
      setPagination(result.pagination);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not load projects.'));
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status, priority]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleDeactivate(project: Project) {
    if (!window.confirm(`Deactivate "${project.name}"? This cannot be undone from here.`)) return;
    try {
      await deactivateProject(project._id);
      fetchProjects();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0B0F] px-6 py-8 lg:px-10 lg:py-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Projects</h1>
            <p className="text-sm text-slate-500 mt-1">
              {pagination ? `${pagination.total} project${pagination.total === 1 ? '' : 's'} in your workspace` : 'Loading your workspace...'}
            </p>
          </div>
          <RoleGate allow={['ADMIN']}>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-brand-600/20"
            >
              <Plus className="w-4 h-4" /> Create Project
            </button>
          </RoleGate>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search by name, code, or client"
              className={`pl-9 ${darkInputClass}`}
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className={`w-auto ${darkInputClass}`}
          >
            <option value="">All statuses</option>
            <option value="PLANNING">Planning</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            value={priority}
            onChange={(e) => {
              setPage(1);
              setPriority(e.target.value);
            }}
            className={`w-auto ${darkInputClass}`}
          >
            <option value="">All priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            <button onClick={fetchProjects} className="ml-auto underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 rounded-2xl border border-dashed border-white/10">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4">
              <FolderKanban className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-slate-200 font-medium mb-1">
              {hasActiveFilters ? 'No projects match your filters' : 'No projects yet'}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm">
              {hasActiveFilters
                ? 'Try adjusting your search or filters.'
                : 'Projects you create or are assigned to will show up here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                onEdit={() => setEditingProject(project)}
                onDeactivate={() => handleDeactivate(project)}
              />
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 text-sm text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchProjects();
          }}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={() => {
            setEditingProject(null);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
}
