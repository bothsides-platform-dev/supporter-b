// 견적 템플릿(요율표) — PG 전용 독립 페이지.
// auth/redirect 가드 + 워크스페이스 템플릿 로드 후 QuoteTemplateList(client)에 위임.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidQuoteTemplateRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { QuoteTemplateList } from '@/components/quote-templates/QuoteTemplateList';

export const dynamic = 'force-dynamic';

export default async function QuoteTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/quote-templates');
  }
  if (session.user.workspaceType !== 'pg') {
    redirect('/home');
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
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <QuoteTemplateList
        initialTemplates={initialTemplates}
        workspaceName={ws?.name}
      />
    </PageEnter>
  );
}
