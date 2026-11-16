import { Skeleton } from '@/components/ui';

export default function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-panel p-5">
      <div className="mb-4 flex items-start justify-between">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-5 w-5" />
      </div>
      <Skeleton className="mb-2 h-4 w-2/3" />
      <Skeleton className="mb-1.5 h-3 w-full" />
      <Skeleton className="mb-4 h-3 w-4/5" />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="mb-4 h-1.5 w-full rounded-full" />
      <div className="flex items-center justify-between border-t border-white/5 pt-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
