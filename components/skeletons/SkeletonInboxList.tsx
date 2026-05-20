import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  rows?: number
}

export function SkeletonInboxList({ rows = 5 }: Props) {
  return (
    <div className="px-8">
      <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border border-[var(--md-sys-color-outline-variant)] rounded-md">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={`inbox-row-${i}`}
            data-testid="skeleton-inbox-row"
            className="px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-4 w-12 rounded-full ml-auto" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-2 w-20" />
              <Skeleton className="h-2 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
