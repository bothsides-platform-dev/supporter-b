// app/(app)/inbox/[rfpId]/loading.tsx
import { SkeletonBriefPanel, SkeletonBidForm } from '@/components/skeletons'

export default function Loading() {
  return (
    <div className="px-8 py-8 grid grid-cols-[340px_1fr] gap-12">
      <SkeletonBriefPanel />
      <SkeletonBidForm />
    </div>
  )
}
