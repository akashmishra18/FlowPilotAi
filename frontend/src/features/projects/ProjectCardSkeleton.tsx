export default function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/10" />
        <div className="w-5 h-5 rounded bg-white/5" />
      </div>
      <div className="h-4 w-2/3 rounded bg-white/10 mb-2" />
      <div className="h-3 w-full rounded bg-white/5 mb-1.5" />
      <div className="h-3 w-4/5 rounded bg-white/5 mb-4" />
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-20 rounded-full bg-white/5" />
        <div className="h-6 w-24 rounded-full bg-white/5" />
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/5 mb-4" />
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="h-4 w-20 rounded bg-white/5" />
        <div className="h-4 w-16 rounded bg-white/5" />
      </div>
    </div>
  );
}
