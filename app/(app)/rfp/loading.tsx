import { SkeletonPageHeader, SkeletonTableRows } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <SkeletonPageHeader hasAction />
      </div>
      <div className="flex-1">
        <SkeletonTableRows cols={[1, 4, 2, 1, 1.5]} rows={5} hasChip />
      </div>
    </div>
  )
}
