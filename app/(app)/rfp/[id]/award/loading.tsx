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
      {/* 헤더 */}
      <div>
        <Skeleton className="h-3 w-32 mb-2" />
        <Skeleton className="h-8 w-64" />
      </div>

      {/* 선택 제안 */}
      <SectionRows rows={7} />

      {/* 계약 조건 */}
      <SectionRows rows={6} />

      {/* 확정 액션 */}
      <section className="border-t border-[var(--md-sys-color-outline-variant)] pt-6 space-y-4">
        <Skeleton className="h-24 w-full rounded-md" />
        <div className="flex gap-3">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
        </div>
      </section>
    </div>
  )
}
