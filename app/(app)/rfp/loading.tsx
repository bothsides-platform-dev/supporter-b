import { Skeleton } from '@/components/ui/skeleton';
import { RfpListTableSkeleton } from '@/components/rfp/RfpListTable';

export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-36" />
          <Skeleton className="h-5 w-40 mt-1" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <RfpListTableSkeleton />
    </div>
  );
}
