import { SettingsPage } from '@/components/settings/SettingsPage';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsPageSkeleton() {
  return (
    <SettingsPage title="알림 설정">
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-4 w-64 max-w-full" />
    </SettingsPage>
  );
}
