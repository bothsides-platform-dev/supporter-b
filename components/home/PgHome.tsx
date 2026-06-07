import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { listConversationsForViewer } from '@/lib/server/actions/chat/conversationLoaders';
import { buildHomeMessagesSnapshot } from '@/lib/server/dashboard/homeMessages';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function PgHome({ workspaceId }: { workspaceId: string }) {
  const [dashboard, allConversations] = await Promise.all([
    loadPgDashboard(workspaceId),
    listConversationsForViewer(),
  ]);
  const { conversations, unreadCount } = buildHomeMessagesSnapshot(allConversations);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard
        dashboard={dashboard}
        workspaceType="pg"
        conversations={conversations}
        unreadCount={unreadCount}
      />
    </PageEnter>
  );
}
