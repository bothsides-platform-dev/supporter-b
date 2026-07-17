// 계약서 PDF 템플릿 관리 — PG 전용 독립 페이지. quote-templates/page.tsx 가드 전례 미러.
import { redirect } from 'next/navigation';
import { requirePgPage } from '@/lib/auth/page-guards';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractTemplateList } from '@/components/contract-templates/ContractTemplateList';
import { getContractTemplateRepo } from '@/lib/server/repositories/factory';
import { isEContractVisible } from '@/lib/features/e-contract';

export const dynamic = 'force-dynamic';

export default async function ContractTemplatesPage() {
  const session = await requirePgPage('/contract-templates');
  if (!isEContractVisible({ isMaster: session.user.isMaster ?? false })) {
    redirect('/home');
  }

  const templates = await (await getContractTemplateRepo()).listByWorkspace(session.user.workspaceId);

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <ContractTemplateList initialTemplates={templates} />
    </PageEnter>
  );
}
