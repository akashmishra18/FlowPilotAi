import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Users, Calendar, Pencil, Power } from 'lucide-react';
import { Project } from './types';
import { STATUS_META, PRIORITY_META, getStatusDerivedProgress, getInitials, getAvatarColorClasses, formatDate } from './ui';
import { useAuthStore } from '@/store/authStore';

interface ProjectCardProps {
  project: Project;
  onEdit: () => void;
  onDeactivate: () => void;
}

export default function ProjectCard({ project, onEdit, onDeactivate }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);

  const canManage = user?.role === 'ADMIN' || (user?.role === 'MANAGER' && user._id === project.managerId?._id);
  const canDeactivate = user?.role === 'ADMIN' && project.isActive;

  const status = STATUS_META[project.status];
  const priority = PRIORITY_META[project.priority];
  const progress = getStatusDerivedProgress(project.status);

  return (
    <div
      className={`group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05] hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] ${!project.isActive ? 'opacity-60' : ''}`}
    >
      <Link to={`/projects/${project._id}`} className="absolute inset-0 rounded-2xl" aria-label={project.name} />

      <div className="relative flex items-start justify-between mb-4 pointer-events-none">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-semibold ${getAvatarColorClasses(project._id)}`}>
          {getInitials(project.name)}
        </div>

        <div className="pointer-events-auto" ref={menuRef}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
            aria-label="Project actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-40 rounded-xl border border-white/10 bg-[#15161c] shadow-xl py-1 z-10">
              <Link
                to={`/projects/${project._id}`}
                className="block px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                View details
              </Link>
              {canManage && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onEdit();
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {canDeactivate && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onDeactivate();
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
                >
                  <Power className="w-3.5 h-3.5" /> Deactivate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative pointer-events-none">
        <h3 className="font-semibold text-slate-100 mb-1 pr-4">{project.name}</h3>
        <p className="text-sm text-slate-400 line-clamp-2 mb-4 min-h-[2.5rem]">
          {project.description || 'No description provided.'}
        </p>

        <div className="flex items-center gap-2 mb-4">
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

        {progress !== null && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${status.dot} transition-all duration-500`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-medium text-slate-300 shrink-0">
              {getInitials(project.managerId?.name ?? '?')}
            </div>
            <span className="truncate">{project.managerId?.name ?? 'Unassigned'}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {project.members.length}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {formatDate(project.deadline)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
