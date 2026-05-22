import { Skeleton } from '@/components/ui/skeleton';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';

export default function Loading() {
  return (
    <>
      <div className="px-8 pt-6">
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="px-8 py-8 space-y-10">
        <RfpDetailContent.Skeleton />
      </div>
    </>
  );
}
