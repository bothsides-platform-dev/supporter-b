import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/ui/Divider';

export function ProfilePageSkeleton() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-7 w-48" />
      </div>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-16" />
          <Divider />
        </div>
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-36" />
          </div>
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {([['w-12', 'w-40'], ['w-12', 'w-24']] as const).map(([lw, vw], i) => (
            <div key={i} className="py-2 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${lw}`} />
              <Skeleton className={`h-3 ${vw}`} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-10 rounded-full" />
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {(['w-32', 'w-20', 'w-28', 'w-24', 'w-20'] as const).map((w, i) => (
            <div key={i} className="py-2 flex items-baseline justify-between">
              <Skeleton className={`h-2.5 ${i % 2 === 0 ? 'w-16' : 'w-12'}`} />
              <Skeleton className={`h-3 ${w}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
