import { Skeleton } from '@/components/ui/skeleton';

export function MembersPageSkeleton() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-52 mt-1" />
      </div>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-6" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {(['w-28', 'w-24', 'w-32'] as const).map((nw, i) => (
            <div key={i} className="py-4 flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 ${nw}`} />
                <Skeleton className={`h-2.5 ${i % 2 === 0 ? 'w-36' : 'w-40'}`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
