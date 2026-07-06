import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';
import { getUserRepo } from '@/lib/server/repositories/factory';
import { shouldShowSampleEntry } from '@/lib/onboarding/visibility';

export async function BuyerHome({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [dashboard, allItems, onboarding] = await Promise.all([
    loadBuyerDashboard(workspaceId),
    listInboxForViewer(),
    (await getUserRepo()).getOnboarding(userId),
  ]);
  const { items, unreadCount } = buildHomeMessagesSnapshot(allItems);
  const showSampleEntry = shouldShowSampleEntry(onboarding, 'buyerSample');
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="buyer"
        items={items}
        unreadCount={unreadCount}
        showSampleEntry={showSampleEntry}
      />
    </PageEnter>
  );
}
