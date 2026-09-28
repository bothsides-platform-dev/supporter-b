import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { SHOW_TEST_PG_COOKIE, showTestPgFromCookie } from '@/lib/features/test-pg';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { searchWorkspaces } from '@/lib/server/workspaces/search';
import { RfpCreateWizard } from '@/components/rfp/RfpCreateWizard';
import type { PgWorkspace } from '@/components/rfp/RfpStep3PgSelect';

export const dynamic = 'force-dynamic';

export default async function RfpNewPage() {
  // PG 워크스페이스 사용자는 RFP를 작성할 수 없음 — 홈으로 이동 (안내 포함)
  const preCheck = await auth();
  if (preCheck?.user?.workspaceType === 'pg') {
    redirect('/home?notice=pg-rfp-blocked');
  }

  // 비로그인 / 미완료 세션 → /login?next=/rfp-create 또는 /logout (루프 세이프 가드)
  const session = await requireBuyerPage('/rfp-create');

  // 테스트용 PG 는 기본 숨김. 쿠키를 서버가 직접 읽으므로 숨긴 이름은 RSC
  // 페이로드에 실리지 않는다 (해제 방법은 lib/features/test-pg.ts 헤더 참고).
  const cookieStore = await cookies();
  const includeTest = showTestPgFromCookie(cookieStore.get(SHOW_TEST_PG_COOKIE)?.value);
  const workspaceRepo = await getWorkspaceRepo();
  const [pgRows, industryGroups] = await Promise.all([
    searchWorkspaces({ type: 'pg', includeTest }),
    workspaceRepo.listPgRecommendationGroups({ includeTest }),
  ]);

  const nameCount = new Map<string, number>();
  for (const row of pgRows) {
    nameCount.set(row.name, (nameCount.get(row.name) ?? 0) + 1);
  }

  const pgList: PgWorkspace[] = pgRows.map((row) => ({
    id: row.id,
    name: row.name,
    displayName:
      (nameCount.get(row.name) ?? 1) > 1
        ? `${row.name} #${row.id.slice(0, 8)}`
        : row.name,
    logoUpdatedAt: row.logoUpdatedAt,
  }));

  const ws = await workspaceRepo.findById(session.user.workspaceId);
  // ws.bizProfile 미등록이어도 RFP 작성 허용 (사전 제안 모드)
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4 sm:px-8 sm:py-8">
      <div className="mb-4 shrink-0 lg:mb-10">
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          새 견적 요청
        </h1>
      </div>
      <div className="min-h-0 flex-1">
        <RfpCreateWizard
          bizProfile={ws?.bizProfile ?? undefined}
          workspaceName={ws?.name ?? ''}
          pgList={pgList}
          industryGroups={industryGroups}
        />
      </div>
    </div>
  );
}
