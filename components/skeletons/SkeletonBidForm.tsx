import { Skeleton } from '@/components/ui/skeleton'

export function SkeletonBidForm() {
  return (
    <div className="space-y-4" data-testid="skeleton-bid-form">
      <Skeleton className="h-4 w-24" />
      {/* 정산 섹션 카드 */}
      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-md p-4 space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`settle-${i}`} className="space-y-1">
              <Skeleton className="h-2 w-3/5" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
      {/* 수수료 섹션 카드 */}
      <div className="border border-[var(--md-sys-color-outline-variant)] rounded-md p-4 space-y-3">
        <Skeleton className="h-3 w-16" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={`fee-${i}`} className="space-y-1">
              <Skeleton className="h-2 w-1/2" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
