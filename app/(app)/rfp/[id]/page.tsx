import { Suspense } from 'react';
import { PageEnter } from '@/components/primitives/PageEnter';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';
import { loadBoard } from '@/lib/server/board/loadBoard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireBuyerPage(`/rfp/${id}`);

  const { workspaceId, id: userId, name, email } = session.user;

  return (
    <Suspense
      fallback={
        <PageEnter className="px-8 py-8 space-y-10">
          <RfpDetailContent.Skeleton />
        </PageEnter>
      }
    >
      <RfpDetailLoader
        id={id}
        wsId={workspaceId}
        userId={userId}
        userName={name ?? email ?? '구매사 담당자'}
      />
    </Suspense>
  );
}

async function RfpDetailLoader({
  id,
  wsId,
  userId,
  userName,
}: {
  id: string;
  wsId: string;
  userId: string;
  userName: string;
}) {
  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId: wsId,
    userId,
    userName,
  });

  if (!data) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  // rfp_bids board (columns + placement-resolved cards) for the kanban view.
  const board = await loadBoard({
    workspaceId: data.rfp.buyerWsId,
    workspaceType: 'buyer',
    kind: 'rfp_bids',
    scope: { rfpId: data.rfp.id },
  });

  return (
    <PageEnter className="px-8 py-8 space-y-10">
      <RfpDetailContent data={data} boardColumns={board.columns} boardCards={board.cards} />
    </PageEnter>
  );
}
