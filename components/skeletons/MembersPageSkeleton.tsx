import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/primitives/Divider';
import { settingsWidePageClass } from '@/components/settings/settings-layout';

export function MembersPageSkeleton() {
  return (
    <div className={`${settingsWidePageClass} space-y-8 md:space-y-10`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* 활성 멤버 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-6" />
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {(['w-28', 'w-24', 'w-32'] as const).map((nw, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 ${nw}`} />
                <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-36' : 'w-40'}`} />
              </div>
              <Skeleton className="hidden h-6 w-14 sm:block" />
              <Skeleton className="hidden h-3 w-36 sm:block" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
