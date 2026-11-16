import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface StyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:cursor-not-allowed disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] active:brightness-95';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-500 active:bg-brand-700',
  secondary: 'border border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80 hover:border-brand-300',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-slate-50',
  danger: 'border border-rose-900/80 bg-rose-950/50 text-rose-200 hover:bg-rose-900/70',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

/** Class string for anything that should *look* like a button (e.g. a router <Link>). */
export function buttonClasses({ variant = 'secondary', size = 'md', className }: StyleOptions = {}): string {
  return clsx(base, variants[variant], sizes[size], className);
}
