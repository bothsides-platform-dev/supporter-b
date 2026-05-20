import { SkeletonPageHeader, SkeletonInboxList } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <SkeletonPageHeader />
      </div>
      <SkeletonInboxList rows={5} />
    </div>
  )
}
