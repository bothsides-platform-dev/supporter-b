import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  hasAction?: boolean
}

export function SkeletonPageHeader({ hasAction = false }: Props) {
  return (
    <div className="flex items-center">
      <Skeleton className="h-5 w-36" />
      {hasAction && (
        <Skeleton
          data-testid="skeleton-page-header-action"
          className="ml-auto h-8 w-20 rounded-md"
        />
      )}
    </div>
  )
}
