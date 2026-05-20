import { Skeleton } from '@/components/ui/skeleton'

export function SkeletonRfpDetailHeader() {
  return (
    <div className="space-y-3" data-testid="skeleton-rfp-detail-header">
      <Skeleton className="h-2 w-20" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="ml-auto h-8 w-16 rounded-md" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-2 w-20" />
        <Skeleton className="h-2 w-14" />
        <Skeleton className="h-2 w-16" />
      </div>
    </div>
  )
}
