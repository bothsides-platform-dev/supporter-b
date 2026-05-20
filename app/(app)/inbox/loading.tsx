// app/(app)/inbox/loading.tsx
import { SkeletonTabs, SkeletonInboxList } from '@/components/skeletons'

export default function Loading() {
  return (
    <>
      <SkeletonTabs count={4} />
      <SkeletonInboxList rows={5} />
    </>
  )
}
