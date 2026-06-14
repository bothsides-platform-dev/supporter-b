// PG RFP 상세 (RSC). 데이터·소유 가드·markOpened 부수효과는 loadPgRfpDetail 에 위임.
// auth/redirect 가드만 page shell 책임. 새로고침·딥링크는 인터셉터를 건너뛰어 이
// 정식 페이지가 모달과 같은 딜룸 셸(DealRoomFull)을 풀스크린으로 렌더한다.
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { DealRoomFull } from '@/components/deal-room/DealRoomFull';
import { DealRoomChat } from '@/components/deal-room/DealRoomChat';
import { PgDealRoomBody } from '@/components/deal-room/pg/PgDealRoomBody';
import { DealRoomPageSkeleton } from '@/components/skeletons';
import { MarkInboxViewed } from '@/components/inbox/MarkInboxViewed';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: Props) {
  // URL 파라미터는 사람용 code(P-YYMM-NNNN).
  const { rfpId: rfpCode } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  return (
    <>
      <MarkInboxViewed rfpId={rfpCode} />
      <Suspense fallback={<DealRoomPageSkeleton />}>
        <PgRfpDetailLoader rfpCode={rfpCode} wsId={session.user.workspaceId} />
      </Suspense>
    </>
  );
}

async function PgRfpDetailLoader({
  rfpCode,
  wsId,
}: {
  rfpCode: string;
  wsId: string;
}) {
  const data = await loadPgRfpDetail({ code: rfpCode, workspaceId: wsId });
  if (!data) notFound();

  const chip: { label: string; color: ChipColor } = data.pendingRequote
    ? { label: '재요청', color: 'warning' }
    : data.myBid
      ? { label: '견적 보냄', color: 'tertiary' }
      : { label: '신규', color: 'warning' };

  return (
    <DealRoomFull
      code={data.rfp.code}
      title={data.rfp.title}
      statusChip={<Chip label={chip.label} color={chip.color} />}
      chat={
        // 온보딩 샘플은 데모 구매사가 보낸 가공 견적 — 채팅 비노출(샌드박스). 그 외엔
        // 상대(구매사) 고정 시드.
        data.rfp.isSample ? undefined : (
          <DealRoomChat
            rfpId={data.rfp.id}
            rfpCode={data.rfp.code}
            rfpTitle={data.rfp.title}
            fixedCounterparty={{
              workspaceId: data.rfp.buyerWsId,
              name: data.buyerName,
              type: 'buyer',
            }}
          />
        )
      }
    >
      <PgDealRoomBody data={data} />
    </DealRoomFull>
  );
}
