import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { PageEnter } from '@/components/primitives/PageEnter';
import { BidComparisonView } from '@/components/rfp/BidComparisonView';
import { RfpInviteManager } from '@/components/rfp/RfpInviteManager';
import { auth } from '@/auth';
import {
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { baseUrl } from '@/lib/server/actions/auth/_shared';
import type { InvitationStatus } from '@/lib/types/invitation';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  draft: '임시저장',
  sent: '발송됨',
  closed: '마감',
  awarded: '계약완료',
  cancelled: '취소',
};
const statusColor: Record<string, ChipColor> = {
  draft: 'surface',
  sent: 'warning',
  closed: 'surface',
  awarded: 'tertiary',
  cancelled: 'error',
};

type Props = { params: Promise<{ id: string }> };

export default async function RfpDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id || session.user.workspaceType !== 'buyer') {
    redirect(`/login?next=/rfp/${id}`);
  }

  const rfp = await (await getRfpRepo()).findById(id);
  if (!rfp || rfp.buyerWsId !== session.user.workspaceId) {
    return (
      <div className="px-8 py-8">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          RFP를 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  const allBids = await (await getBidRepo()).findByRfp(id);
  const rfpBids = allBids.filter((b) => b.status === 'submitted');

  const wsRepo = await getWorkspaceRepo();
  const ws = await wsRepo.findById(rfp.buyerWsId);
  const companyName = ws?.name ?? '—';

  // Invitation status per workspace — `allowedPgWorkspaceIds` is source of truth.
  // addPgWorkspacesToRfpAction creates a 'draft' row per workspace so all appear
  // even before the invite is sent.
  const invitations = await (await getInvitationRepo()).findByRfp(id);
  const invByWsId = new Map<string, InvitationStatus>();
  for (const inv of invitations) {
    if (inv.pgWsId) invByWsId.set(inv.pgWsId, inv.status);
  }

  // Fetch workspace names for all invited PG workspaces
  const allPgWsIds = Array.from(
    new Set([...rfp.allowedPgWorkspaceIds, ...rfpBids.map((b) => b.pgWsId)]),
  );
  const allPgWorkspaces = await Promise.all(allPgWsIds.map((pgId) => wsRepo.findById(pgId)));
  const allPgWsNameMap: Record<string, string> = {};
  allPgWorkspaces.forEach((w, i) => {
    if (w) allPgWsNameMap[allPgWsIds[i]] = w.name;
  });

  const inviteList = rfp.allowedPgWorkspaceIds.map((wsId) => ({
    wsId,
    wsName: allPgWsNameMap[wsId] ?? wsId,
    status: invByWsId.get(wsId) ?? ('draft' as InvitationStatus),
  }));

  // RSC는 매 요청마다 재실행되므로 시계 접근이 필요하다 — purity 룰은 클라이언트
  // 컴포넌트의 안정성을 위한 것이라 RSC에는 해당하지 않음.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const canEdit =
    rfp.status === 'sent' && new Date(rfp.deadline).getTime() > nowMs;
  const shareUrl = rfp.shareToken
    ? `${baseUrl()}/share/rfp/${rfp.shareToken}`
    : '';

  const pgWsNameMap = allPgWsNameMap;

  const bizProfile = rfp.bizProfile;
  const cardFee = bizProfile?.grade ? STATUTORY_CARD_FEE[bizProfile.grade] : NaN;

  return (
    <PageEnter className="px-8 py-8 space-y-10">
      {/* Header */}
      <div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {rfp.id}
        </span>
        <div className="flex items-start justify-between mt-1 gap-4">
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {rfp.title}
          </h1>
          <div className="flex items-center gap-3 shrink-0">
            <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
            {rfp.status === 'sent' && rfpBids.length > 0 && (
              <Link href={`/rfp/${id}/award`}>
                <Button size="sm">수주 처리 →</Button>
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Label size="md" muted={false}>마감 {formatDate(rfp.deadline)}</Label>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <Label size="md" muted={false}>PG {rfp.allowedPgWorkspaceIds.length}개사</Label>
          <span className="text-[var(--md-sys-color-outline)]">·</span>
          <Label size="md" muted={false}>받은 제안 {rfpBids.length}건</Label>
        </div>
      </div>

      {/* Comparison table */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            제안 비교
          </span>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <BidComparisonView
          rfpId={id}
          bids={rfpBids}
          grade={bizProfile?.grade}
          rfpStatus={rfp.status}
          awardedBidId={rfp.awardedBidId}
          pgWsNameMap={pgWsNameMap}
          authorId={session.user.id}
          authorName={session.user.name ?? session.user.email ?? '구매사 담당자'}
        />
      </section>

      {/* Meta sidebar */}
      <div className="grid grid-cols-2 gap-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8">
        {/* Biz info */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Label size="md" muted={false}>사업자 정보</Label>
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {[
              ['상호명', companyName],
              ['사업자번호', bizProfile?.bizNo ?? '미입력'],
              ...(bizProfile?.grade
                ? [
                    ['등급', GRADE_LABELS[bizProfile.grade]],
                    [
                      '카드',
                      Number.isNaN(cardFee)
                        ? '카드사별 협의'
                        : `${(cardFee * 100).toFixed(2)}%`,
                    ],
                  ]
                : [['등급', '미정']]),
            ].map(([label, value]) => (
              <div
                key={label}
                className="py-2 flex items-baseline justify-between"
              >
                <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  {label}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* PG list + memo */}
        <section className="space-y-6">
          <RfpInviteManager
            rfpId={id}
            invitations={inviteList}
            shareUrl={shareUrl}
            canEdit={canEdit}
          />
          {rfp.memo && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Label size="md" muted={false}>메모</Label>
                <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
              </div>
              <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
                {rfp.memo}
              </p>
            </div>
          )}
        </section>
      </div>
    </PageEnter>
  );
}
