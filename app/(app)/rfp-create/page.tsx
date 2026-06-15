import { redirect } from 'next/navigation';
import { auth } from '@/auth';
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

  const pgRows = await searchWorkspaces({ type: 'pg' });

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
  }));

  const ws = await (await getWorkspaceRepo()).findById(session.user.workspaceId);
  // ws.bizProfile 미등록이어도 RFP 작성 허용 (사전 제안 모드)
  return (
    <div className="px-8 py-8 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
      <div className="mb-10 lg:flex-none">
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          새 견적 요청
        </h1>
      </div>
      <div className="lg:flex-1 lg:min-h-0">
        <RfpCreateWizard
          bizProfile={ws?.bizProfile ?? undefined}
          workspaceName={ws?.name ?? ''}
          pgList={pgList}
        />
      </div>
    </div>
  );
}
