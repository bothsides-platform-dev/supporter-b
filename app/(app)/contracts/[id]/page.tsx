// 전자계약 상세 — buyer/pg 공용(양측 워크스페이스 멤버만). auth+마스터 게이트 후
// loadContractDocDetail 로 문서를 로드하고, buyer admin 이 재지정 가능한 경우에만
// 자기 워크스페이스 팀 로스터를 함께 내려준다(재지정 다이얼로그의 멤버 Select 용).
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractDocView } from '@/components/contracts/ContractDocView';
import { loadContractDocDetail } from '@/lib/server/contract-loader';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { isEContractVisible } from '@/lib/features/e-contract';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ContractDocPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect(`/login?next=/contracts/${id}`);
  }
  if (!isEContractVisible({ isMaster: session.user.isMaster ?? false })) {
    redirect('/home');
  }

  const detail = await loadContractDocDetail(id, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
  if (!detail) notFound();

  // canReassign 은 로더가 이미 "myParty==='buyer' && 승인된 admin" 조건으로 좁혀둔
  // 값이다 — true 일 때만 buyer 워크스페이스 팀 로스터를 추가로 로드한다.
  let reassignMembers: { userId: string; name: string; email: string }[] | undefined;
  if (detail.canReassign) {
    const wsRepo = await getWorkspaceRepo();
    const [roster, recipients] = await Promise.all([
      wsRepo.teamRoster(detail.doc.buyerWsId),
      wsRepo.approvedMemberRecipients(detail.doc.buyerWsId),
    ]);
    const emailByUserId = new Map(recipients.map((r) => [r.userId, r.email]));
    reassignMembers = roster.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: emailByUserId.get(m.userId) ?? '',
    }));
  }

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <ContractDocView {...detail} reassignMembers={reassignMembers} />
    </PageEnter>
  );
}
