import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-6">
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-60 shrink-0 flex-col gap-px border-r border-[var(--md-sys-color-outline-variant)] p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
