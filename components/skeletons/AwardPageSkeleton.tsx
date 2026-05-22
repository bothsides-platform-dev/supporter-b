import { Skeleton } from '@/components/ui/skeleton';

export function AwardPageSkeleton() {
  return (
    <div className="px-8 py-8 space-y-10">
      <div>
        <Skeleton className="h-2.5 w-40 mb-2" />
        <Skeleton className="h-7 w-96" />
        <Skeleton className="h-3 w-80 mt-2" />
      </div>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-20" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {(['w-8', 'w-16', 'w-16', 'w-14', 'w-20', 'w-8', 'w-16'] as const).map((lw, i) => (
            <div key={i} className="py-2.5 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${lw}`} />
              <Skeleton className={`h-3 ${i % 3 === 0 ? 'w-24' : i % 3 === 1 ? 'w-20' : 'w-16'}`} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-20" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {(['w-12', 'w-20', 'w-8', 'w-8', 'w-16', 'w-16'] as const).map((lw, i) => (
            <div key={i} className="py-2.5 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${lw}`} />
              <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-24' : 'w-20'}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--md-sys-color-outline-variant)] pt-6 space-y-4">
        <div className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)] p-4 space-y-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-3 w-72" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </section>
    </div>
  );
}
