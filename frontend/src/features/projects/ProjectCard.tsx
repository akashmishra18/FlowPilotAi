import { Link } from 'react-router-dom';
import { Users, Calendar, Pencil, Power } from 'lucide-react';
import { ActionMenu, ActionMenuItem } from '@/components/ui';
import { Project } from './types';
import { STATUS_META, PRIORITY_META, getInitials, getAvatarColorClasses, formatDate } from './ui';
import { useAuthStore } from '@/store/authStore';

interface ProjectCardProps {
  project: Project;
  onEdit: () => void;
  onDeactivate: () => void;
}

export default function ProjectCard({ project, onEdit, onDeactivate }: ProjectCardProps) {
  const user = useAuthStore((s) => s.user);

  // UI hints that mirror the backend's rules; the API re-checks every action.
  const canManage = user?.role === 'ADMIN' || (user?.role === 'MANAGER' && user._id === project.managerId?._id);
  const canDeactivate = user?.role === 'ADMIN' && project.isActive;

  const status = STATUS_META[project.status];
  const priority = PRIORITY_META[project.priority];

  const items: ActionMenuItem[] = [
    ...(canManage ? [{ label: 'Edit', icon: <Pencil className="h-3.5 w-3.5" aria-hidden="true" />, onSelect: onEdit }] : []),
    ...(canDeactivate ? [{ label: 'Deactivate', icon: <Power className="h-3.5 w-3.5" aria-hidden="true" />, tone: 'danger' as const, onSelect: onDeactivate }] : []),
  ];

  return (
    <div className={`group relative rounded-xl border border-white/10 bg-panel p-5 shadow-panel transition-colors hover:border-white/20 hover:bg-raised ${!project.isActive ? 'opacity-70' : ''}`}>
      {/* Whole card is one link; the actions menu sits above it. */}
      <Link to={`/projects/${project._id}`} className="absolute inset-0 rounded-xl" aria-label={`${project.name} — view details`} />

      <div className="pointer-events-none relative mb-4 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold ${getAvatarColorClasses(project._id)}`} aria-hidden="true">
          {getInitials(project.name)}
        </div>
        <div className="pointer-events-auto relative z-10">
          <ActionMenu label={`Actions for ${project.name}`} items={items} />
        </div>
      </div>

      <div className="pointer-events-none relative">
        <h3 className="mb-1 pr-4 font-semibold text-slate-100">{project.name}</h3>
        <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-sm text-slate-400">{project.description || 'No description provided.'}</p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
            {status.label}
          </span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${priority.badge}`}>{priority.label}</span>
          {!project.isActive && <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">Inactive</span>}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-slate-400">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-slate-200" aria-hidden="true">
              {getInitials(project.managerId?.name ?? '?')}
            </span>
            <span className="truncate">{project.managerId?.name ?? 'Unassigned'}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1" title="Members">
              <Users className="h-3.5 w-3.5" aria-hidden="true" /> <span className="sr-only">Members:</span>
              {project.members.length}
            </span>
            <span className="flex items-center gap-1" title="Deadline">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {formatDate(project.deadline)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
