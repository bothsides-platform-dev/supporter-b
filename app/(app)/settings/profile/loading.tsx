import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      {/* 페이지 헤더 */}
      <div>
        <Skeleton className="h-3 w-28 mb-2" />
        <Skeleton className="h-8 w-48" />
      </div>

      {/* 사용자 섹션 */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-16" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-2.5 w-36" />
          </div>
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {[0, 1].map((i) => (
            <div key={i} className="py-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      </section>

      {/* 워크스페이스 섹션 */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-10 rounded-full" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="py-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <Skeleton className="h-2 w-16" />
              <Skeleton className={`h-3 ${i === 0 ? 'w-36' : 'w-28'}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
