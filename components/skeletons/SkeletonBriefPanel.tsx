import { Skeleton } from '@/components/ui/skeleton'

export function SkeletonBriefPanel() {
  return (
    <div className="border-r border-[var(--md-sys-color-outline-variant)] pr-12 space-y-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="border-t border-[var(--md-sys-color-outline-variant)] pt-4 space-y-2">
        <Skeleton className="h-2 w-3/5" />
        <Skeleton className="h-2 w-4/5" />
        <Skeleton className="h-2 w-1/2" />
        <Skeleton className="h-5 w-14 rounded-full mt-2" />
      </div>
    </div>
  )
}
