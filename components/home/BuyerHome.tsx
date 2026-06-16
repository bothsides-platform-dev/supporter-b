import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listInboxForViewer } from '@/lib/server/actions/chat/inboxLoader';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function BuyerHome({ workspaceId }: { workspaceId: string }) {
  const [dashboard, allItems] = await Promise.all([
    loadBuyerDashboard(workspaceId),
    listInboxForViewer(),
  ]);
  const { items, unreadCount } = buildHomeMessagesSnapshot(allItems);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="buyer"
        items={items}
        unreadCount={unreadCount}
      />
    </PageEnter>
  );
}
