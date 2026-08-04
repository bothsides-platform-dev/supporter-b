// 계약서 템플릿 — PG 전용 독립 페이지.
// auth/redirect 가드 + listSigningTemplatesAction 로드 후 ContractTemplateList(client)에 위임.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listSigningTemplatesAction } from '@/lib/server/actions/signing/listSigningTemplatesAction';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractTemplateList } from '@/components/contract-templates/ContractTemplateList';

export const dynamic = 'force-dynamic';

export default async function ContractTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/contract-templates');
  }
  if (session.user.workspaceType !== 'pg') {
    redirect('/home');
  }

  const result = await listSigningTemplatesAction();

  // 리스트 페이지 셸(/quote-templates 와 동일) — PageHeader 스트립 + 내부 스크롤 본문.
  // 로드 실패를 빈 배열로 위장하지 않는다 — 리스트가 에러 표면 + 재시도를 그린다.
  return (
    <PageEnter className="flex h-full flex-col">
      <ContractTemplateList
        initialTemplates={result.ok ? result.templates : []}
        loadFailed={!result.ok}
      />
    </PageEnter>
  );
}
