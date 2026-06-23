import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/ui/Divider';

export function NotificationsPageSkeleton() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-48" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3 w-64 mt-1" />
      </div>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="py-4 flex items-start gap-4">
              <Skeleton className="h-3 w-8 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className={`h-3.5 ${i % 3 === 0 ? 'w-64' : i % 3 === 1 ? 'w-52' : 'w-72'}`} />
                <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-80' : 'w-60'}`} />
                <Skeleton className="h-2.5 w-32 mt-1" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
