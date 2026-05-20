// app/(app)/rfp/[id]/loading.tsx
import { SkeletonRfpDetailHeader, SkeletonKanbanBoard } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="px-8 py-8 space-y-10">
      <SkeletonRfpDetailHeader />
      <SkeletonKanbanBoard cols={3} cardsPerCol={2} />
    </div>
  )
}
