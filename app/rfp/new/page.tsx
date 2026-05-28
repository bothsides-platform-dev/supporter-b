import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { RfpCreateWizard } from '@/components/rfp/RfpCreateWizard';

export const dynamic = 'force-dynamic';

export default async function RfpNewPage() {
  const session = await auth();

  // PG 워크스페이스 사용자는 RFP를 작성할 수 없음 — 홈으로 이동
  if (session?.user?.workspaceType === 'pg') {
    redirect('/home?notice=pg-rfp-blocked');
  }

  // 비인증 또는 buyer 워크스페이스 미완료 → 게스트 모드
  if (!session?.user?.id || !session.user.workspaceId) {
    return (
      <div className="px-8 py-8 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
        <div className="mb-10 lg:flex-none">
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            신규 제안 요청
          </h1>
        </div>
        <div className="lg:flex-1 lg:min-h-0">
          <RfpCreateWizard guest />
        </div>
      </div>
    );
  }

  const ws = await (await getWorkspaceRepo()).findById(session.user.workspaceId);
  // ws.bizProfile 미등록이어도 RFP 작성 허용 (사전 제안 모드)
  return (
    <div className="px-8 py-8 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
      <div className="mb-10 lg:flex-none">
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          신규 제안 요청
        </h1>
      </div>
      <div className="lg:flex-1 lg:min-h-0">
        <RfpCreateWizard
          bizProfile={ws?.bizProfile ?? undefined}
          workspaceName={ws?.name ?? ''}
        />
      </div>
    </div>
  );
}
