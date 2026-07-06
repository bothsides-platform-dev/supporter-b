import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/primitives/Divider';

export function MembersPageSkeleton() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-52 mt-1" />
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

      {/* 초대 링크 (admin) */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-20" />
          <Divider />
        </div>
        <div className="flex items-center gap-3 border border-[var(--md-sys-color-outline-variant)] rounded-md px-3 py-2">
          <Skeleton className="flex-1 h-3" />
          <Skeleton className="h-7 w-10 rounded-sm" />
          <Skeleton className="h-7 w-12 rounded-sm" />
        </div>
        <Skeleton className="h-2.5 w-64 mt-2" />
      </section>

      {/* 멤버 초대 (admin) */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-16" />
          <Divider />
        </div>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-8 w-full" />
          </div>
          <Skeleton className="h-9 w-24 rounded-sm md:ml-4" />
        </div>
        <Skeleton className="h-2.5 w-56 mt-4" />
      </section>
    </div>
  );
}
