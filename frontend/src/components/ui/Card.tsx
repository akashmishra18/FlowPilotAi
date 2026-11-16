import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

/** The single surface style used across the app. Avoid nesting Cards inside Cards. */
export default function Card({ padded = true, interactive = false, className, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-700/70 bg-panel shadow-panel',
        padded && 'p-4 sm:p-5',
        interactive && 'transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-400/30 hover:bg-raised hover:shadow-premium',
        className,
      )}
      {...rest}
    />
  );
}

interface CardHeadingProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeading({ title, description, action }: CardHeadingProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
