import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  count?: number
}

export function SkeletonTabs({ count = 4 }: Props) {
  return (
    <div className="flex gap-2 px-8 py-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} data-testid="skeleton-tab" className="h-6 w-12 rounded-full" />
      ))}
    </div>
  )
}
