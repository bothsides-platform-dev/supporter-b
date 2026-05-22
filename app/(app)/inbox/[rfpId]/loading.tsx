import { Skeleton } from '@/components/ui/skeleton';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';

export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <Skeleton className="h-5 w-16" />
      </div>
      <PgRfpDetailContent.Skeleton />
    </div>
  );
}
