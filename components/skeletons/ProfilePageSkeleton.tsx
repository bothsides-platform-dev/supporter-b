import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/primitives/Divider';
import { settingsDetailRowClass, settingsProfilePageClass } from '@/components/settings/settings-layout';

export function ProfilePageSkeleton() {
  return (
    <div className={`${settingsProfilePageClass} space-y-8 md:space-y-10`}>
      <Skeleton className="h-7 w-40" />

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-16" />
          <Divider />
        </div>
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-7 w-20" />
          </div>
        </div>
        <div className="border-y border-[var(--md-sys-color-outline-variant)]">
          <div className={settingsDetailRowClass}>
            <Skeleton className="h-3 w-12" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        </div>
        <Skeleton className="mt-3 h-3 w-28" />
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-10 rounded-full" />
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {(['w-32', 'w-24', 'w-28', 'w-24'] as const).map((w, i) => (
            <div key={i} className={settingsDetailRowClass}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className={`h-4 ${w}`} />
            </div>
          ))}
        </div>
        <Skeleton className="mt-3 h-3 w-28" />
      </section>
    </div>
  );
}
