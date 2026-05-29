import Link from 'next/link';
import { requireBuyerPage } from '@/lib/auth/page-guards';
import { loadBuyerAwardData } from '@/lib/server/rfp-detail-loader';
import { AwardConfirm } from '@/components/rfp/AwardConfirm';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bidId?: string }>;
};

export default async function AwardPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await requireBuyerPage(`/rfp/${id}/award`);

  const data = await loadBuyerAwardData({
    code: id,
    workspaceId: session.user.workspaceId,
    bidId: sp.bidId,
  });

  if (!data) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          수주할 제안을 찾을 수 없습니다.
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

  return (
    <AwardConfirm
      rfpId={data.rfp.id}
      rfpCode={data.rfp.code}
      rfpDeadline={data.rfp.deadline}
      rfpAllowedCount={data.rfp.allowedPgWorkspaceIds.length}
      bizProfile={{ bizNo: data.rfp.bizProfile?.bizNo, grade: data.rfp.bizProfile?.grade }}
      buyerWorkspaceName={data.buyerWorkspaceName}
      selected={data.selected}
      others={data.others}
      pgWsNameById={data.pgWsNameById}
      alreadyAwarded={data.rfp.status === 'awarded'}
    />
  );
}
