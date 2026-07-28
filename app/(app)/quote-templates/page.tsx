// 견적 템플릿(요율표) — PG 전용 독립 페이지.
// auth/redirect 가드 + 워크스페이스 템플릿 로드 후 QuoteTemplateList(client)에 위임.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import { toQuoteTemplateOption } from '@/lib/server/quote-template-option';
import type { QuoteTemplateOption } from '@/lib/types/bid';
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

  const templates = await (await getBidQuoteTemplateRepo()).listByWorkspace(
    session.user.workspaceId,
  );

  const initialTemplates: QuoteTemplateOption[] = templates.map(toQuoteTemplateOption);

  // 리스트 페이지 셸(/inbox·/rfp 와 동일) — PageHeader 스트립 + 내부 스크롤 본문.
  return (
    <PageEnter className="flex h-full flex-col">
      <QuoteTemplateList initialTemplates={initialTemplates} />
    </PageEnter>
  );
}
