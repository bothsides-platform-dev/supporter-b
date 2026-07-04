// PG RFP 상세 (RSC). 데이터·소유 가드·markOpened 부수효과는 loadPgRfpDetail 에 위임.
// auth/redirect 가드만 page shell 책임. 새로고침·딥링크는 인터셉터를 건너뛰어 이
// 정식 페이지가 모달과 같은 딜룸 셸(DealRoomFull)을 풀스크린으로 렌더한다.
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { Chip } from '@/components/primitives/Chip';
import { DealRoomFull } from '@/components/deal-room/DealRoomFull';
import { DealRoomChat } from '@/components/deal-room/DealRoomChat';
import { PgDealRoomBody } from '@/components/deal-room/pg/PgDealRoomBody';
import { DealRoomPageSkeleton } from '@/components/skeletons';
import { MarkInboxViewed } from '@/components/inbox/MarkInboxViewed';
import { pgRequestChip } from '@/lib/rfp-status';
import { SamplePgDealRoom } from '@/components/onboarding/SamplePgDealRoom';
import { SAMPLE_RFP_CODE, samplePgRfp } from '@/lib/onboarding/fixtures';

type Props = { params: Promise<{ rfpId: string }> };

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params }: Props) {
  // URL 파라미터는 사람용 code(P-YYMM-NNNN).
  const { rfpId: rfpCode } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  // 가상 샘플 온보딩 — DB 행 없이 fixture 로 딜룸을 재현한다. MarkInboxViewed·로더 모두 건너뛴다.
  if (rfpCode === SAMPLE_RFP_CODE) {
    return (
      <DealRoomFull code={samplePgRfp.code} title={samplePgRfp.title}>
        <SamplePgDealRoom />
      </DealRoomFull>
    );
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

  const chip = pgRequestChip({
    pendingRequote: !!data.pendingRequote,
    hasBid: !!data.myBid,
    awarded: data.rfp.status === 'awarded',
    awardedToMe: data.awardedToMe,
  });

  return (
    <DealRoomFull
      code={data.rfp.code}
      title={data.rfp.title}
      statusChip={<Chip label={chip.label} color={chip.color} />}
      chat={
        <DealRoomChat
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          fixedCounterparty={{
            workspaceId: data.rfp.buyerWsId,
            name: data.buyerName,
            type: 'buyer',
            logoUpdatedAt: data.buyerLogoUpdatedAt,
          }}
          closedCounterpartyIds={
            data.rfp.status === 'awarded' && !data.awardedToMe
              ? [data.rfp.buyerWsId]
              : []
          }
        />
      }
    >
      <PgDealRoomBody data={data} />
    </DealRoomFull>
  );
}
