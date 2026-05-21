// 수주 확정 — 가로채기 모달. 상세 모달에서 '수주' soft-nav(BidComparisonTable Link)
// 시 이 슬롯이 award 전체 페이지 대신 모달로 가로챈다. AwardConfirm 은 성공 시
// navigate 없이 "✓ 수주 확정" 인플레이스로 전환 → 모달과 궁합. 새로고침·직접 진입은
// app/(app)/rfp/[id]/award/page.tsx (전체 페이지). 둘은 loadBuyerAwardData 공유.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadBuyerAwardData } from '@/lib/server/rfp-detail-loader';
import { AwardConfirm } from '@/components/rfp/AwardConfirm';
import { RouteModalShell } from '@/components/modal/RouteModalShell';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bidId?: string }>;
};

export default async function AwardModalPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect(`/login?next=/rfp/${id}/award`);
  }

  const data = await loadBuyerAwardData({
    code: id,
    workspaceId: session.user.workspaceId,
    bidId: sp.bidId,
  });

  if (!data) {
    return (
      <RouteModalShell title="수주 처리">
        <p className="px-2 py-8 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          수주할 제안을 찾을 수 없습니다.
        </p>
      </RouteModalShell>
    );
  }

  return (
    <RouteModalShell title="수주 처리" size="sm:max-w-[640px]">
      <AwardConfirm
        rfpId={data.rfp.id}
        rfpCode={data.rfp.code}
        rfpDeadline={data.rfp.deadline}
        rfpAllowedCount={data.rfp.allowedPgWorkspaceIds.length}
        bizProfile={{ bizNo: data.rfp.bizProfile?.bizNo, grade: data.rfp.bizProfile?.grade }}
        buyerWorkspaceName={data.buyerWorkspaceName}
        selected={data.selected}
        others={data.others}
        pgWsNameById={data.pgWsNameById}
        alreadyAwarded={data.rfp.status === 'awarded'}
      />
    </RouteModalShell>
  );
}
