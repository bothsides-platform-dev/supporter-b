// PG RFP 상세 (RSC). 데이터·소유 가드·markOpened 부수효과는 loadPgRfpDetail 에 위임.
// auth/redirect 가드만 page shell 책임. 새로고침·딥링크는 인터셉터를 건너뛰어 이
// 정식 페이지가 모달과 같은 딜룸 셸(DealRoomFull)을 풀스크린으로 렌더한다.
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { Chip } from '@/components/primitives/Chip';
import { DealRoomFull } from '@/components/deal-room/DealRoomFull';
import { PgChatPanel } from '@/components/deal-room/pg/PgChatPanel';
import { PgDealRoomBody } from '@/components/deal-room/pg/PgDealRoomBody';
import { DealRoomPageSkeleton } from '@/components/skeletons';
import { MarkInboxViewed } from '@/components/inbox/MarkInboxViewed';
import { pgRequestState } from '@/lib/rfp/pg-request-state';
import {
  PG_DEAL_ROOM_TAB_QUERY_KEY,
  parsePgDealRoomTab,
  type PgDealRoomLinkTab,
} from '@/lib/rfp/pg-deal-room-link';

type Props = {
  params: Promise<{ rfpId: string }>;
  searchParams: Promise<Partial<Record<typeof PG_DEAL_ROOM_TAB_QUERY_KEY, string | string[]>>>;
};

export const dynamic = 'force-dynamic';

export default async function InboxDetailPage({ params, searchParams }: Props) {
  // URL 파라미터는 사람용 code(P-YYMM-NNNN).
  const { rfpId: rfpCode } = await params;
  // 알림·메일 딥링크(?tab=)만 기본 탭(요청 조건) 대신 그 탭을 연다.
  const initialTab = parsePgDealRoomTab((await searchParams)[PG_DEAL_ROOM_TAB_QUERY_KEY]);

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  return (
    <>
      <MarkInboxViewed rfpId={rfpCode} />
      <Suspense fallback={<DealRoomPageSkeleton />}>
        <PgRfpDetailLoader
          rfpCode={rfpCode}
          wsId={session.user.workspaceId}
          userId={session.user.id}
          initialTab={initialTab}
        />
      </Suspense>
    </>
  );
}

async function PgRfpDetailLoader({
  rfpCode,
  wsId,
  userId,
  initialTab,
}: {
  rfpCode: string;
  wsId: string;
  userId: string;
  initialTab?: PgDealRoomLinkTab;
}) {
  const data = await loadPgRfpDetail({
    code: rfpCode,
    workspaceId: wsId,
    userId,
  });
  if (!data) notFound();

  const chip = pgRequestState({
    stage:
      data.rfp.status === 'awarded'
        ? data.awardedToMe
          ? 'won'
          : 'lost'
        : data.myBid
          ? 'submitted'
          : 'received',
    rfpStatus: data.rfp.status,
    reviewStatus: data.review?.status ?? (data.hasWithdrawnBid ? 'withdrawn' : undefined),
    rfpDeadline: data.pendingRequote?.deadline ?? data.rfp.deadline,
    hasPendingRequote: !!data.pendingRequote,
    bidWindowOpen: data.bidWindowOpen,
  });

  return (
    <DealRoomFull
      code={data.rfp.code}
      title={data.rfp.title}
      statusChip={<Chip label={chip.label} color={chip.color} />}
      headerActions={
        <PgChatPanel
          workspaceId={wsId}
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          buyer={{
            workspaceId: data.buyer.id,
            name: data.buyer.name,
            type: 'buyer',
            logoUpdatedAt: data.buyer.logoUpdatedAt,
          }}
          closedCounterpartyIds={
            data.rfp.status === 'awarded' && !data.awardedToMe ? [data.rfp.buyerWsId] : []
          }
        />
      }
    >
      <PgDealRoomBody data={data} initialTab={initialTab} />
    </DealRoomFull>
  );
}
