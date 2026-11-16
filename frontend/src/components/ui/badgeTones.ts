export type BadgeTone = 'neutral' | 'violet' | 'cyan' | 'success' | 'warning' | 'danger' | 'info';

export const tones: Record<BadgeTone, { badge: string; dot: string }> = {
  neutral: { badge: 'bg-slate-800 text-slate-300 border-slate-700', dot: 'bg-slate-400' },
  violet: { badge: 'bg-brand-50 text-brand-300 border-brand-200', dot: 'bg-brand-400' },
  cyan: { badge: 'bg-cyan-950/50 text-cyan-200 border-cyan-900', dot: 'bg-cyan-400' },
  success: { badge: 'bg-emerald-950/50 text-emerald-200 border-emerald-900', dot: 'bg-emerald-400' },
  warning: { badge: 'bg-amber-950/50 text-amber-200 border-amber-900', dot: 'bg-amber-400' },
  danger: { badge: 'bg-rose-950/50 text-rose-200 border-rose-900', dot: 'bg-rose-400' },
  info: { badge: 'bg-sky-950/50 text-sky-200 border-sky-900', dot: 'bg-sky-400' },
};

export function toneDotClass(tone: BadgeTone): string {
  return tones[tone].dot;
}
