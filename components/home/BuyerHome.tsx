import { PageEnter } from '@/components/primitives/PageEnter';
import { loadBuyerDashboard } from '@/lib/server/dashboard/loadDashboard';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function BuyerHome({ workspaceId }: { workspaceId: string }) {
  const dashboard = await loadBuyerDashboard(workspaceId);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard dashboard={dashboard} workspaceType="buyer" />
    </PageEnter>
  );
}
