// 계약 보관함 — 구매사·PG **양쪽** 공용 페이지(메시지 패턴).
//
// 서명 완료본·감사추적인증서 사본과, 플랫폼 밖에서 체결한 계약서 수동 업로드를
// 한자리에서 본다. 딜룸의 온디맨드 다운로드는 그대로 두고 여기는 추가 표면이다.
//
// 로드 실패를 빈 배열로 위장하지 않는다(`ContractTemplateList` 관례) — 빈 상태와
// 장애는 사용자가 취할 행동이 다르다.
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { listContractArchivesAction } from '@/lib/server/actions/contract-archive';
import { toContractArchiveEntry } from '@/lib/contract-archive/entry';
import type { ContractArchiveEntry } from '@/lib/types/contract-archive';
import { PageEnter } from '@/components/primitives/PageEnter';
import { ContractArchiveList } from '@/components/contract-archive/ContractArchiveList';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/contracts');
  }
  const workspaceType = session.user.workspaceType === 'pg' ? 'pg' : 'buyer';

  const r = await listContractArchivesAction();
  const entries: ContractArchiveEntry[] = r.ok
    ? r.rows.map((row) => toContractArchiveEntry(row, workspaceType))
    : [];

  return (
    <PageEnter className="flex h-full flex-col">
      <ContractArchiveList initialEntries={entries} loadFailed={!r.ok} />
    </PageEnter>
  );
}
