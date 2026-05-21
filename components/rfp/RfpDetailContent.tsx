// 구매사 RFP 상세 본문 — 전체 페이지(app/(app)/rfp/[id])가 사용.
// loader(BuyerRfpDetailData) 산출물만 받는 표현 컴포넌트 — 재fetch 금지.
// 바깥 패딩/PageEnter 래핑은 호출부(page) 책임.
import Link from 'next/link';
import { Label } from '@/components/primitives/Label';
import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { Skeleton } from '@/components/ui/skeleton';
import { BidComparisonView } from '@/components/rfp/BidComparisonView';
import { RfpInviteManager } from '@/components/rfp/RfpInviteManager';
import { AttachmentPreviewList } from '@/components/attachments/AttachmentPreviewList';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import { formatDate } from '@/lib/format';
import type { BuyerRfpDetailData } from '@/lib/server/rfp-detail-loader';

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

export function RfpDetailContent({ data }: { data: BuyerRfpDetailData }) {
  const {
    rfp,
    bids,
    notesByBid,
    rfpFiles,
    companyName,
    inviteList,
    pgWsNameMap,
    canEdit,
    shareUrl,
    authorId,
    authorName,
  } = data;
  const bizProfile = rfp.bizProfile;
  const cardFee = bizProfile?.grade ? STATUTORY_CARD_FEE[bizProfile.grade] : NaN;

  return (
    <>
      {/* Header */}
      <div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
          {rfp.code}
        </span>
        <div className="flex items-start justify-between mt-1 gap-4">
          <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {rfp.title}
          </h1>
          <div className="flex items-center gap-3 shrink-0">
            <Chip label={statusLabel[rfp.status]} color={statusColor[rfp.status]} />
            {rfp.status === 'sent' && bids.length > 0 && (
              <Link href={`/rfp/${rfp.code}/award`}>
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
          <Label size="md" muted={false}>받은 제안 {bids.length}건</Label>
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
          rfpId={rfp.code}
          bids={bids}
          notesByBid={notesByBid}
          grade={bizProfile?.grade}
          rfpStatus={rfp.status}
          awardedBidId={rfp.awardedBidId}
          pgWsNameMap={pgWsNameMap}
          authorId={authorId}
          authorName={authorName}
        />
      </section>

      {/* RFP attachments — buyer-uploaded requirement docs */}
      <AttachmentPreviewList files={rfpFiles} />

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
              <div key={label} className="py-2 flex items-baseline justify-between">
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
            rfpId={rfp.code}
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
    </>
  );
}

RfpDetailContent.Skeleton = function RfpDetailContentSkeleton() {
  return (
    <>
      <div>
        <Skeleton className="h-3 w-24 mb-2" />
        <div className="flex items-start justify-between mt-1 gap-4">
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-2 w-16" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <Skeleton className="h-48 w-full" />
      </section>

      <Skeleton className="h-16 w-full" />

      <div className="grid grid-cols-2 gap-10 border-t border-[var(--md-sys-color-outline-variant)] pt-8">
        <section>
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-3 w-20" />
            <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
          </div>
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="py-2 flex items-baseline justify-between">
                <Skeleton className="h-2 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-6">
          <Skeleton className="h-32 w-full" />
        </section>
      </div>
    </>
  );
};
