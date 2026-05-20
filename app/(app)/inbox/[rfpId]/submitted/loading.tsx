import { Skeleton } from '@/components/ui/skeleton'

function SectionRows({ rows }: { rows: number }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
      </div>
      <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="py-2.5 flex items-baseline justify-between">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Loading() {
  return (
    <div className="px-8 py-8 space-y-10">
      {/* 상태 헤더 */}
      <div>
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-3 w-72 mt-2" />
      </div>

      {/* 제안 요청 */}
      <SectionRows rows={4} />

      {/* 제출 제안 */}
      <SectionRows rows={6} />
    </div>
  )
}
