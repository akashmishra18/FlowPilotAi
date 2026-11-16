import { ReactNode } from 'react';
import clsx from 'clsx';
import { BadgeTone, tones } from './badgeTones';

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone].badge, className)}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', tones[tone].dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}
