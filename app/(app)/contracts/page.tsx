// 전자계약 목록 — buyer/pg 공용. auth+마스터 게이트 후 워크스페이스 문서 목록을 로드한다.
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PageEnter } from '@/components/primitives/PageEnter';
import { Label } from '@/components/primitives/Label';
import { ContractList } from '@/components/contracts/ContractList';
import { listContractDocsForWorkspace } from '@/lib/server/contract-loader';
import { isEContractVisible } from '@/lib/features/e-contract';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/contracts');
  }
  if (!isEContractVisible({ isMaster: session.user.isMaster ?? false })) {
    redirect('/home');
  }

  const items = await listContractDocsForWorkspace(session.user.workspaceId);

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <div>
        <Label size="md" muted={false} className="block mb-2">
          CONTRACTS
        </Label>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          전자계약
        </h1>
      </div>
      <ContractList items={items} />
    </PageEnter>
  );
}
