// PG RFP 상세 (RSC). 데이터·소유 가드·markOpened 부수효과는 loadPgRfpDetail 에 위임.
// auth/redirect 가드만 page shell 책임.
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { ChatRail } from '@/components/messages/ChatRail';
import { ChatRailToggle } from '@/components/messages/ChatRailToggle';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';
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
      <Suspense
        fallback={
          <div className="px-8 py-8">
            <PgRfpDetailContent.Skeleton />
          </div>
        }
      >
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
  // 온보딩 샘플은 데모 구매사가 보낸 가공 견적 — 채팅 레일을 노출하지 않는다(샌드박스).
  const showChat = !data.rfp.isSample;
  // 우측 채팅 레일(상대방 채팅: 구매사 고정 / 팀 채팅)과 본문이 나란히 — 레일에
  // rfp uuid·구매사 정보가 필요해 로더 안에서 함께 렌더한다(lg 미만 비노출).
  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1 px-8 py-8">
        {showChat && (
          <div className="mb-4 flex justify-end">
            <ChatRailToggle />
          </div>
        )}
        <PgRfpDetailContent data={data} variant="full" />
      </div>
      {showChat && (
        <ChatRail
          rfpId={data.rfp.id}
          rfpCode={data.rfp.code}
          rfpTitle={data.rfp.title}
          fixedCounterparty={{
            workspaceId: data.rfp.buyerWsId,
            name: data.buyerName,
            type: 'buyer',
          }}
        />
      )}
    </div>
  );
}
