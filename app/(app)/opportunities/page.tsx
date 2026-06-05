import { Suspense } from 'react';
import { requirePgPage } from '@/lib/auth/page-guards';
import { getPgRequestRepo } from '@/lib/server/repositories/factory';
import { OpportunityList } from '@/components/opportunities/OpportunityList';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/primitives/EmptyState';
import { InboxIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const session = await requirePgPage('/opportunities');
  return (
    <div className="flex h-full flex-col">
      <Suspense
        fallback={
          <>
            <PageHeader title="견적 기회" />
            <div className="px-6 py-4 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              LOADING…
            </div>
          </>
        }
      >
        <OpportunitiesLoader wsId={session.user.workspaceId} />
      </Suspense>
    </div>
  );
}

async function OpportunitiesLoader({ wsId }: { wsId: string }) {
  const reqRepo = await getPgRequestRepo();
  const items = await reqRepo.findOpenRfpsForPg(wsId, new Date());

  return (
    <>
      <PageHeader title="견적 기회" count={items.length} />
      <div className="flex-1 overflow-auto px-6 py-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={32} />}
            title="지금 열린 견적 요청이 없어요."
            description="구매사가 공개한 견적 요청이 여기에 표시돼요. 관심 있는 견적 요청에 참여를 요청해 보세요."
          />
        ) : (
          <OpportunityList items={items} />
        )}
      </div>
    </>
  );
}
