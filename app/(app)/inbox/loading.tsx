import { SkeletonPageHeader, SkeletonTableRows } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <SkeletonPageHeader />
      </div>
      <SkeletonTableRows cols={[1.5, 4, 1, 1, 1.5]} rows={5} hasChip />
    </div>
  )
}
