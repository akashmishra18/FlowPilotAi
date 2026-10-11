import { ProjectPriority, ProjectStatus } from './types';

export const STATUS_META: Record<ProjectStatus, { label: string; dot: string; badge: string }> = {
  PLANNING: { label: 'Planning', dot: 'bg-slate-400', badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20' },
  ACTIVE: { label: 'On track', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  ON_HOLD: { label: 'At risk', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  COMPLETED: { label: 'Completed', dot: 'bg-violet-400', badge: 'bg-violet-500/10 text-violet-300 border-violet-500/20' },
  CANCELLED: { label: 'Cancelled', dot: 'bg-rose-400', badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
};

export const PRIORITY_META: Record<ProjectPriority, { label: string; badge: string }> = {
  LOW: { label: 'Low priority', badge: 'bg-white/5 text-slate-300 border-white/10' },
  MEDIUM: { label: 'Medium priority', badge: 'bg-sky-500/10 text-sky-300 border-sky-500/20' },
  HIGH: { label: 'High priority', badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  CRITICAL: { label: 'Critical priority', badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
};

/**
 * FlowPilot doesn't track task-level completion yet (Tasks ships in a
 * later phase), so there is no real weighted-progress number to show.
 * Rather than invent one, this derives a deterministic stage indicator
 * purely from the project's real `status` field — the same input for
 * every viewer, never random or per-card fake data. Swap this out for an
 * actual task-completion calculation once Tasks exists.
 */
export function getStatusDerivedProgress(status: ProjectStatus): number | null {
  switch (status) {
    case 'PLANNING':
      return 5;
    case 'ACTIVE':
      return 55;
    case 'ON_HOLD':
      return 55;
    case 'COMPLETED':
      return 100;
    case 'CANCELLED':
      return null; // no meaningful progress bar for a cancelled project
  }
}

const AVATAR_PALETTE = [
  'bg-teal-500/20 text-teal-300',
  'bg-orange-500/20 text-orange-300',
  'bg-violet-500/20 text-violet-300',
  'bg-sky-500/20 text-sky-300',
  'bg-pink-500/20 text-pink-300',
  'bg-amber-500/20 text-amber-300',
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic color from a seed string (e.g. project id), so a given project always gets the same avatar color. */
export function getAvatarColorClasses(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Shared dark-input styling for this feature's forms (kept local rather than touching the global light `.input` class used by other modules). */
export const darkInputClass =
  'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50';

export const darkLabelClass = 'block text-sm font-medium text-slate-300 mb-1';

export function formatDate(value: string | null): string {
  if (!value) return 'No deadline';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
