import clsx from 'clsx';

/** Decorative loading placeholder; hidden from assistive tech (parents announce loading via aria-busy). */
export default function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('rounded-md bg-slate-200/80 motion-safe:animate-pulse transition-opacity duration-200', className)} />;
}
