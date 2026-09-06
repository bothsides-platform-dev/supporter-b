// Notifications activity page — /notifications
//
// Dedicated page for the user's in-app notification feed.
// Reuses NotificationActivityList + MarkAllReadButton from settings/notifications.
// /settings/notifications is kept as the alert preferences stub (see that page).
import { requireSession } from '@/lib/auth/session';
import { getNotificationRepo } from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { isUnread, type Notification } from '@/lib/types/notification';
import { PageHeader } from '@/components/shell/PageHeader';

import { MarkAllReadButton } from '@/app/(app)/settings/notifications/MarkAllReadButton';
import { NotificationActivityList } from '@/app/(app)/settings/notifications/NotificationActivityList';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await requireSession();
  const repo = await getNotificationRepo();
  const notifications: Notification[] = session.user.workspaceId
    ? await repo.findRecentForUser(session.user.id, session.user.workspaceId, 100, 'inapp')
    : [];
  const unreadCount = notifications.filter(isUnread).length;

  return (
    <PageEnter className="flex flex-col h-full">
      <PageHeader
        title="알림"
        count={unreadCount}
        countKind="unread"
        action={unreadCount > 0 ? <MarkAllReadButton /> : undefined}
      />
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <NotificationActivityList items={notifications} />
      </div>
    </PageEnter>
  );
}
