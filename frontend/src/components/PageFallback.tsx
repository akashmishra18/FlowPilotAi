import { Skeleton } from '@/components/ui';

/** Suspense fallback for lazy route chunks. */
export default function PageFallback() {
  return (
    <div className="space-y-4 p-1" role="status" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
