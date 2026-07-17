// 전자계약 작성(발송) — PG 전용. searchParams 의 rfp 코드로 선정 조건을 프리필한다.
import { redirect } from 'next/navigation';
import { requirePgPage } from '@/lib/auth/page-guards';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractCreateForm } from '@/components/contracts/ContractCreateForm';
import { loadContractCreateData } from '@/lib/server/contract-loader';
import { isEContractVisible } from '@/lib/features/e-contract';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ rfp?: string }> };

export default async function ContractCreatePage({ searchParams }: Props) {
  const { rfp: rfpCode } = await searchParams;
  const session = await requirePgPage('/contracts/new');
  if (!isEContractVisible({ isMaster: session.user.isMaster ?? false })) {
    redirect('/home');
  }
  if (!rfpCode) {
    redirect('/inbox');
  }

  const data = await loadContractCreateData(rfpCode, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
  if (!data) redirect('/inbox');
  if ('activeDocId' in data) {
    redirect(`/contracts/${data.activeDocId}`);
  }

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <ContractCreateForm
        rfp={data.rfp}
        templates={data.templates}
        buyerPrefill={data.buyerPrefill}
        pgPrefill={data.pgPrefill}
        buyerSignerName={data.buyerSignerName}
        pgMembers={data.pgMembers}
        defaultExpiresDays={data.defaultExpiresDays}
        viewerUserId={session.user.id}
      />
    </PageEnter>
  );
}
