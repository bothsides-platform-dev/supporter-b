import { Skeleton } from '@/components/ui/skeleton';
import { SettingsPage } from '@/components/settings/SettingsPage';

export default function Loading() {
  return (
    <SettingsPage title="활동 기록">
      <div className="space-y-2">
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
    </SettingsPage>
  );
}
