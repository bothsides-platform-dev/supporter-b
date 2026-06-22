import { Skeleton } from '@/components/primitives/Skeleton';

export function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3">
        <Skeleton className="size-8 rounded-[var(--md-sys-shape-full)]" />
        <Skeleton className="h-4 w-32 rounded-[var(--md-sys-shape-extra-small)]" />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10 w-2/3 rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-10 w-1/2 self-end rounded-[var(--md-sys-shape-medium)]" />
        <Skeleton className="h-10 w-3/5 rounded-[var(--md-sys-shape-medium)]" />
      </div>
      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <Skeleton className="h-9 w-full rounded-[var(--md-sys-shape-small)]" />
      </div>
    </div>
  );
}
