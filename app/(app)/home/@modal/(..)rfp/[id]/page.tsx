// 구매사 RFP 상세 — 가로채기 모달. 슬롯이 home 세그먼트 아래(home/@modal)에 있어
// **홈 칸반(/home)에서 soft-nav 로 /rfp/[code] 에 진입할 때만** 전체 페이지 대신
// 모달로 가로챈다. /rfp 목록·검색·알림 등 home 밖에서의 진입, 그리고 새로고침·직접
// 진입은 가로채지 않고 app/(app)/rfp/[id]/page.tsx (전체 페이지) 가 렌더된다.
// 둘은 loadBuyerRfpDetail + RfpDetailContent 를 공유.
//
// ⚠️ 이 인터셉터는 /rfp/<단일세그먼트> 를 전부 [id] 로 잡는다(home 트리 활성 시).
// 따라서 /rfp/ 하위에 static 형제 라우트(/rfp/new, /rfp/import 등)를 두면 안 된다 —
// soft-nav 시 findByCode 가 그 세그먼트를 RFP 코드로 조회해 실패하고 "RFP를 찾을 수
// 없습니다." 모달만 뜬다. 작성 폼은 /rfp-new (형제 경로, app/rfp-new/) 로 분리돼 있다.
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
