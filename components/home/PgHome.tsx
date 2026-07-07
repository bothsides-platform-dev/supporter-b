import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';

export async function PgHome({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [dashboard, allItems, onboarding] = await Promise.all([
    loadPgDashboard(workspaceId),
    listInboxForViewer(),
    (await getUserRepo()).getOnboarding(userId),
  ]);
  const { items, unreadCount } = buildHomeMessagesSnapshot(allItems);
  const showSampleEntry = shouldShowSampleEntry(onboarding, 'pgSample');
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="pg"
        items={items}
        unreadCount={unreadCount}
        showSampleEntry={showSampleEntry}
      />
    </PageEnter>
  );
}
