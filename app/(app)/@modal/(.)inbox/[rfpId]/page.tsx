// PG RFP 상세 — 가로채기 모달. /inbox 목록·홈 칸반 등 (app) 내부에서 soft-nav 로
// /inbox/[code] 진입 시 전체 페이지 대신 모달로 가로챈다. 새로고침·직접 진입은
// app/(app)/inbox/[rfpId]/page.tsx (전체 페이지). 둘은 loadPgRfpDetail +
// PgRfpDetailContent 공유. BidForm 은 mode="modal" — 제출 성공 시 router.refresh()
// 로 같은 모달에 "제출 완료" 인플레이스(전체 페이지로 이탈하지 않음).
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';
import { PgRfpDetailContent } from '@/components/inbox/PgRfpDetailContent';
import { RouteModalShell } from '@/components/modal/RouteModalShell';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ rfpId: string }> };

export default async function InboxDetailModalPage({ params }: Props) {
  const { rfpId: rfpCode } = await params;
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/inbox/${rfpCode}`);
  }

  const data = await loadPgRfpDetail({
    code: rfpCode,
    workspaceId: session.user.workspaceId,
  });

  if (!data) {
    return (
      <RouteModalShell title="RFP">
        <p className="px-2 py-8 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
      </RouteModalShell>
    );
  }

  return (
    <RouteModalShell title={data.rfp.title} size="sm:max-w-[760px]">
      <PgRfpDetailContent data={data} mode="modal" />
    </RouteModalShell>
  );
}
