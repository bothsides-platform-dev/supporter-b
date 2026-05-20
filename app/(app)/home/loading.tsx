import { SkeletonKanbanBoard } from '@/components/skeletons'

export default function Loading() {
  return <SkeletonKanbanBoard cols={6} cardsPerCol={3} />
}
