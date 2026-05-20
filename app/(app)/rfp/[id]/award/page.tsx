import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { AwardConfirm } from '@/components/rfp/AwardConfirm';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bidId?: string }>;
};

export default async function AwardPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id || session.user.workspaceType !== 'buyer') {
    redirect(`/login?next=/rfp/${id}/award`);
  }

  // URL 파라미터 id 는 사람용 code. 내부 조회는 rfp.id(uuid).
  const rfp = await (await getRfpRepo()).findByCode(id);
  if (!rfp || rfp.buyerWsId !== session.user.workspaceId) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
        <Link
          href={`/rfp/${id}`}
          className="mt-4 inline-block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← RFP 상세로
        </Link>
      </div>
    );
  }

  const allBids = (await (await getBidRepo()).findByRfp(rfp.id)).filter(
    (b) => b.status === 'submitted',
  );
  const bidId = sp.bidId;
  const selected = bidId ? allBids.find((b) => b.id === bidId) : undefined;
  if (!selected) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          선택된 제안을 찾을 수 없습니다.
        </p>
        <Link
          href={`/rfp/${id}`}
          className="mt-4 inline-block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          ← RFP 상세로
        </Link>
      </div>
    );
  }

  const others = allBids.filter((b) => b.id !== selected.id);

  // PG 워크스페이스 이름 lookup. allBids에 등장하는 모든 pgWsId 만 hydrate.
  const wsRepo = await getWorkspaceRepo();
  const pgWsIds = Array.from(new Set(allBids.map((b) => b.pgWsId)));
  const pgWsNameById: Record<string, string> = {};
  for (const wsId of pgWsIds) {
    const ws = await wsRepo.findById(wsId);
    if (ws) pgWsNameById[wsId] = ws.name;
  }
  const buyerWs = await wsRepo.findById(rfp.buyerWsId);

  return (
    <AwardConfirm
      rfpId={rfp.id}
      rfpCode={rfp.code}
      rfpDeadline={rfp.deadline}
      rfpAllowedCount={rfp.allowedPgWorkspaceIds.length}
      bizProfile={{
        bizNo: rfp.bizProfile?.bizNo,
        grade: rfp.bizProfile?.grade,
      }}
      buyerWorkspaceName={buyerWs?.name ?? '—'}
      selected={selected}
      others={others}
      pgWsNameById={pgWsNameById}
      alreadyAwarded={rfp.status === 'awarded'}
    />
  );
}
