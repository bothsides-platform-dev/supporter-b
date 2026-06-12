import { Suspense } from 'react';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ChatRail } from '@/components/messages/ChatRail';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';

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
          견적 요청을 찾을 수 없어요.
        </p>
      </div>
    );
  }

  // 우측 채팅 레일(상대방 채팅: FocusComparison 의 포커스 PG 추종 / 팀 채팅)과
  // 본문이 나란히 — 레일은 sticky 라 본문 스크롤에 영향 없음(lg 미만 비노출).
  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">
        <PageEnter className="px-8 py-8 space-y-10">
          <RfpDetailContent data={data} />
        </PageEnter>
      </div>
      {!data.rfp.isSample && (
        <ChatRail rfpId={data.rfp.id} rfpCode={data.rfp.code} rfpTitle={data.rfp.title} />
      )}
    </div>
  );
}
