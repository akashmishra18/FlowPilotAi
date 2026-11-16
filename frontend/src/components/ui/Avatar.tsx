import clsx from 'clsx';
import { getInitials } from '@/lib/text';

const sizes = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

export default function Avatar({ name, size = 'md', className }: { name: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700', sizes[size], className)}>
      {getInitials(name)}
    </span>
  );
}
