import { useCallback, useState } from 'react';
import { FolderKanban, Plus } from 'lucide-react';
import { Alert, Button, ConfirmDialog, EmptyState, PageHeader, Pagination, SearchInput, Select } from '@/components/ui';
import RoleGate from '@/components/RoleGate';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { listProjects, deactivateProject } from '@/features/projects/projectsApi';
import { Project, ProjectPriority, ProjectStatus } from '@/features/projects/types';
import ProjectCard from '@/features/projects/ProjectCard';
import ProjectCardSkeleton from '@/features/projects/ProjectCardSkeleton';
import CreateProjectModal from '@/features/projects/CreateProjectModal';
import EditProjectModal from '@/features/projects/EditProjectModal';
import { parseApiError } from '@/services/errorHelpers';
import { toast } from '@/store/toastStore';

const PAGE_SIZE = 9;

export default function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [priority, setPriority] = useState<ProjectPriority | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deactivating, setDeactivating] = useState<Project | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  const fetcher = useCallback(
    () => listProjects({ page, limit: PAGE_SIZE, search: debouncedSearch || undefined, status: status || undefined, priority: priority || undefined }),
    [page, debouncedSearch, status, priority],
  );
  const { data, error, isLoading, isInitialLoading, reload } = useAsyncData(fetcher, 'Could not load projects.');
  const hasFilters = Boolean(debouncedSearch || status || priority);

  async function confirmDeactivate() {
    if (!deactivating) return;
    setIsBusy(true);
    setActionError(null);
    try {
      await deactivateProject(deactivating._id);
      toast.success(`"${deactivating.name}" deactivated.`);
      setDeactivating(null);
      void reload();
    } catch (err) {
      setDeactivating(null);
      setActionError(parseApiError(err, 'Could not deactivate the project.').message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description={data ? `${data.pagination.total} project${data.pagination.total === 1 ? '' : 's'}` : 'Projects you can access.'}
        actions={
          <RoleGate allow={['ADMIN']}>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Create project
            </Button>
          </RoleGate>
        }
      />

      <form role="search" aria-label="Filter projects" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-3">
        <SearchInput
          aria-label="Search projects"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search name, code or client"
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as ProjectStatus | '');
          }}
        >
          <option value="">All statuses</option>
          <option value="PLANNING">Planning</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On hold</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => {
            setPage(1);
            setPriority(e.target.value as ProjectPriority | '');
          }}
        >
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </Select>
      </form>

      {(error || actionError) && (
        <Alert
          tone="error"
          title={error ? "Couldn't load projects" : "That didn't work"}
          className="mb-4"
          action={
            error ? (
              <Button size="sm" onClick={() => void reload()}>
                Retry
              </Button>
            ) : undefined
          }
        >
          {error ?? actionError}
        </Alert>
      )}

      {isInitialLoading && !data ? (
        <div role="status" aria-busy="true" aria-label="Loading projects" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : data && data.projects.length > 0 ? (
        <div aria-busy={isLoading} className={isLoading ? 'opacity-60 transition-opacity' : undefined}>
          <div className="fp-stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <ProjectCard key={project._id} project={project} onEdit={() => setEditing(project)} onDeactivate={() => setDeactivating(project)} />
            ))}
          </div>
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} onChange={setPage} />
        </div>
      ) : !error && data ? (
        <EmptyState
          icon={FolderKanban}
          title={hasFilters ? 'No projects match your filters' : 'No projects yet'}
          description={hasFilters ? 'Try adjusting your search or filters.' : 'Create a project, select its manager, then add the active employees who will work on it.'}
          action={!hasFilters && <RoleGate allow={['ADMIN']}><Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create first project</Button></RoleGate>}
        />
      ) : null}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}
      {editing && (
        <EditProjectModal
          project={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {deactivating && (
        <ConfirmDialog
          title="Deactivate this project?"
          message={`"${deactivating.name}" will be marked inactive. There is no way to reactivate a project from the app yet.`}
          confirmLabel="Deactivate"
          isLoading={isBusy}
          onConfirm={() => void confirmDeactivate()}
          onCancel={() => setDeactivating(null)}
        />
      )}
    </div>
  );
}
