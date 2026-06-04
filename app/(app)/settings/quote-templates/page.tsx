// 견적 템플릿(요율표) 설정 — PG 전용. auth/redirect 가드 + 워크스페이스 템플릿 로드만
// page shell 책임이고, 목록·생성·편집·삭제 UX는 QuoteTemplatesPanel(client)에 위임.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidQuoteTemplateRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { QuoteTemplatesPanel } from '@/components/settings/QuoteTemplatesPanel';

export const dynamic = 'force-dynamic';

export default async function QuoteTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/settings/quote-templates');
  }
  // 견적 템플릿은 PG 전용 — 구매사는 프로필로 보낸다.
  if (session.user.workspaceType !== 'pg') {
    redirect('/settings/profile');
  }

  const wsId = session.user.workspaceId;
  const [templates, ws] = await Promise.all([
    (await getBidQuoteTemplateRepo()).listByWorkspace(wsId),
    (await getWorkspaceRepo()).findById(wsId),
  ]);

  const initialTemplates = templates.map((t) => ({
    id: t.id,
    name: t.name,
    settleCycle: t.settleCycle,
    settleLimit: t.settleLimit,
    guaranteeInsurance: t.guaranteeInsurance,
    paymentFees: t.paymentFees,
  }));

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <QuoteTemplatesPanel
        initialTemplates={initialTemplates}
        workspaceName={ws?.name}
      />
    </PageEnter>
  );
}
