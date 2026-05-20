import { SkeletonRfpDetailHeader, SkeletonTableRows } from '@/components/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="px-8 py-8 space-y-10">
      <SkeletonRfpDetailHeader />
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <SkeletonTableRows cols={[2, 1, 1, 1, 1, 1, 1, 1.5]} rows={3} hasChip />
      </div>
    </div>
  )
}
