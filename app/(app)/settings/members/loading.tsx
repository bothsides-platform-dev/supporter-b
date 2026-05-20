import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      {/* 페이지 헤더 */}
      <div>
        <Skeleton className="h-3 w-32 mb-2" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-3 w-56 mt-2" />
      </div>

      {/* 활성 멤버 섹션 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-6" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-4 flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-40" />
              </div>
              <Skeleton className="h-2 w-20 hidden md:block" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
