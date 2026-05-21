// 구매사 RFP 상세 — 가로채기 모달. /rfp 목록·홈 칸반 등 (app) 내부에서 soft-nav
// 로 /rfp/[code] 에 진입하면 이 슬롯이 전체 페이지 대신 모달로 가로챈다.
// 새로고침·직접 진입·하드 네비게이션은 가로채지 않고 app/(app)/rfp/[id]/page.tsx
// (전체 페이지) 가 렌더된다. 둘은 loadBuyerRfpDetail + RfpDetailContent 를 공유.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { loadBuyerRfpDetail } from '@/lib/server/rfp-detail-loader';
import { RfpDetailContent } from '@/components/rfp/RfpDetailContent';
import { RouteModalShell } from '@/components/modal/RouteModalShell';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailModalPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId
  ) {
    redirect(`/login?next=/rfp/${id}`);
  }

  const data = await loadBuyerRfpDetail({
    code: id,
    workspaceId: session.user.workspaceId,
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? '구매사 담당자',
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
    <RouteModalShell title={data.rfp.title} size="sm:max-w-[1100px] lg:max-w-[1280px]">
      {/* DialogContent 가 p-4 패딩 제공 — 여기선 섹션 간 수직 간격만. */}
      <div className="space-y-10">
        <RfpDetailContent data={data} />
      </div>
    </RouteModalShell>
  );
}
