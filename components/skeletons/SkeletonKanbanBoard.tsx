import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  cols?: number
  cardsPerCol?: number
}

/**
 * Skeleton placeholder for kanban boards.
 * Default cols=6 matches the home KanbanBoard (6 stages).
 * Pass cols={3} for BidBoard (3 stages: pending/negotiating/decided).
 */
export function SkeletonKanbanBoard({ cols = 6, cardsPerCol = 3 }: Props) {
  return (
    <div
      className="grid gap-3 p-8"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {Array.from({ length: cols }).map((_, ci) => (
        <div
          key={`col-${ci}`}
          data-testid="skeleton-kanban-col"
          className="flex flex-col gap-2 rounded-md bg-[var(--md-sys-color-surface-container)] p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-2 w-10" />
          </div>
          {Array.from({ length: cardsPerCol }).map((_, ki) => (
            <div
              key={`card-${ci}-${ki}`}
              data-testid="skeleton-kanban-card"
              className="rounded-md bg-[var(--md-sys-color-surface)] p-2 flex flex-col gap-1"
            >
              <Skeleton className="h-2 w-4/5" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
