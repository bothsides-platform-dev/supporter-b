import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      {/* 페이지 헤더 */}
      <div>
        <Skeleton className="h-3 w-40 mb-2" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-64 mt-2" />
      </div>

      {/* 알림 목록 섹션 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="py-4 px-2 -mx-2 flex items-start gap-4">
              <Skeleton className="h-2.5 w-8 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2 w-20" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-2.5 w-full max-w-xs" />
                <Skeleton className="h-2 w-28 mt-1" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
