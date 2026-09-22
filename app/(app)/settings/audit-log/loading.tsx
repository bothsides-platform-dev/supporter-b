import { Skeleton } from '@/components/ui/skeleton';
import { settingsWidePageClass } from '@/components/settings/settings-layout';

export default function Loading() {
  return (
    <div className={`${settingsWidePageClass} space-y-6`}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-2 py-3">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
