import { Suspense } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { RfpBoardVisibilityStatus } from '@/components/rfp/RfpBoardVisibilityStatus';
import { DealRoomFull } from '@/components/deal-room/DealRoomFull';
import { DealRoomChat } from '@/components/deal-room/DealRoomChat';
import { buyerClosedCounterpartyIds } from '@/lib/rfp/closed-counterparties';
import { BuyerDealRoomBody } from '@/components/deal-room/buyer/BuyerDealRoomBody';
import { DealRoomPageSkeleton } from '@/components/skeletons';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';
import { rfpStatusChip } from '@/lib/rfp-status';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireBuyerPage(`/rfp/${id}`);

  const { workspaceId, id: userId, name, email } = session.user;

  return (
    <Suspense fallback={<DealRoomPageSkeleton />}>
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
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          견적 요청을 찾을 수 없어요.
        </p>
      </div>
    );
  }

  // 새로고침·딥링크는 인터셉터를 건너뛰어 이 정식 페이지가 풀스크린으로 렌더되며,
  // 모달과 같은 딜룸 셸(DealRoomFull)을 호스팅해 시각·기능이 일치한다.
  const s = rfpStatusChip(data.rfp.status);

  return (
    <DealRoomFull
      code={data.rfp.code}
      title={data.rfp.title}
      statusChip={
        <>
          {s ? <Chip label={s.label} color={s.color} /> : null}
          <RfpBoardVisibilityStatus boardVisible={data.rfp.boardVisible ?? true} />
        </>
      }
      chat={
        <DealRoomChat
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          isSample={data.rfp.isSample}
          closedCounterpartyIds={buyerClosedCounterpartyIds(data.rfp, data.bids)}
        />
      }
    >
      <BuyerDealRoomBody data={data} />
    </DealRoomFull>
  );
}
