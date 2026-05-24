import { PageEnter } from '@/components/primitives/PageEnter';
import { loadPgDashboard } from '@/lib/server/dashboard/loadDashboard';
import { HomeDashboard } from '@/components/home/HomeDashboard';

export async function PgHome({ workspaceId }: { workspaceId: string }) {
  const dashboard = await loadPgDashboard(workspaceId);
  return (
    <PageEnter className="px-8 py-10">
      <HomeDashboard dashboard={dashboard} workspaceType="pg" />
    </PageEnter>
  );
}
