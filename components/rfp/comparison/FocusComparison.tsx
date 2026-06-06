'use client';

// 구매사 견적 비교 — 포커스 스포트라이트. 상단 탭으로 PG 전환(hover peek), 본문에 한
// 견적을 깊게: 개선 요약(hero) + 부차정보 아코디언 3종. 값 단위 hover 는 MetricComparePopover
// 로 전 PG 줄세움. CTA 는 인라인 AwardConfirmDialog 로 선정 확정. 표/보드/별도 award 페이지
// 를 대체한다. 표현 전용 — 데이터는 loadBuyerRfpDetail 산출물.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { ImprovementSummary, type CurrentConditions } from './ImprovementSummary';
import { MetricComparePopover, type CompareRow } from './MetricComparePopover';
import { AwardConfirmDialog } from './AwardConfirmDialog';
import { BidNotesPanel } from '@/components/rfp/bid-detail/BidNotesPanel';
import { BidPdfPane } from '@/components/rfp/bid-detail/BidPdfPane';
import { rankByMetric } from '@/lib/utils/bid-compare';
import { formatKRW, formatPct } from '@/lib/format';
import {
  PAYMENT_METHOD_LABELS,
  type Bid,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';
import { cn } from '@/lib/utils';

type Props = {
  bids: Bid[];
  pgWsNameMap: Record<string, string>;
  current: CurrentConditions;
  notesByBid: Record<string, BidNote[]>;
  rfpStatus: string;
  awardedBidId?: string | null;
  requiredPaymentMethods: readonly PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  /** uuid — awardRfpAction 용 */
  rfpId: string;
  rfpCode: string;
};

export function FocusComparison(props: Props) {
  const { bids, pgWsNameMap, current, notesByBid, rfpStatus, awardedBidId } = props;
  const router = useRouter();

  // 정렬: 카드 수수료 낮은 순(기본). 동률·미입력은 뒤로.
  const sortedBids = useMemo(
    () =>
      [...bids].sort(
        (a, b) => (a.paymentFees.card ?? Infinity) - (b.paymentFees.card ?? Infinity),
      ),
    [bids],
  );

  const defaultBidId = awardedBidId ?? sortedBids[0]?.id;
  const [activeBidId, setActiveBidId] = useState<string | undefined>(defaultBidId);
  const [peekBidId, setPeekBidId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (sortedBids.length === 0) {
    return (
      <EmptyState
        title="견적을 기다리고 있어요"
        description="초대한 PG가 견적을 보내면 여기에서 비교하고 선정할 수 있어요."
      />
    );
  }

  const active = sortedBids.find((b) => b.id === activeBidId) ?? sortedBids[0];
  const pgName = (wsId: string) => pgWsNameMap[wsId] ?? wsId;
  const isAwarded = rfpStatus === 'awarded' || rfpStatus === 'closed';
  const canAward = rfpStatus === 'sent';
  const peek = peekBidId ? sortedBids.find((b) => b.id === peekBidId) : null;

  // 활성 견적의 결제수단 요율 행 — 각 행 hover 시 전 PG 줄세움.
  const feeRows: { key: string; label: string; getValue: (b: Bid) => number | null; baseline?: string | null }[] = [];
  for (const method of Object.keys(active.paymentFees) as PaymentMethod[]) {
    feeRows.push({
      key: method,
      label: PAYMENT_METHOD_LABELS[method],
      getValue: (b) => b.paymentFees[method] ?? null,
      baseline: method === 'card' ? current.feeRate : undefined,
    });
  }
  for (const cm of props.customPaymentMethods) {
    if (active.customFees[cm.id] === undefined) continue;
    feeRows.push({
      key: `custom:${cm.id}`,
      label: cm.label,
      getValue: (b) => b.customFees[cm.id] ?? null,
    });
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          견적 비교
        </span>
        <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          정렬: 카드 수수료 낮은 순
        </span>
      </div>

      {/* Tabs */}
      <div className="relative">
        <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--md-sys-color-outline-variant)]">
          {sortedBids.map((bid) => {
            const isActive = bid.id === active.id;
            const isWinner = isAwarded && bid.id === awardedBidId;
            return (
              <button
                key={bid.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveBidId(bid.id)}
                onMouseEnter={() => setPeekBidId(bid.id)}
                onMouseLeave={() => setPeekBidId((p) => (p === bid.id ? null : p))}
                className={cn(
                  'relative flex items-center gap-2 px-3 h-9 text-[13px] transition-colors cursor-pointer',
                  isActive
                    ? 'text-[var(--md-sys-color-on-surface)] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-[var(--md-sys-color-primary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]',
                )}
              >
                {pgName(bid.pgWsId)}
                {isAwarded && (
                  <Chip
                    label={isWinner ? '선정' : '미선정'}
                    color={isWinner ? 'tertiary' : 'surface'}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Hover peek */}
        {peek && peek.id !== active.id && (
          <div className="absolute z-20 mt-1 rounded-[var(--md-sys-shape-extra-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3 shadow-md">
            <p className="text-[12px] font-[600] text-[var(--md-sys-color-on-surface)] mb-1.5">
              {pgName(peek.pgWsId)}
            </p>
            <dl className="space-y-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
              <PeekRow label="카드" value={peek.paymentFees.card !== undefined ? formatPct(peek.paymentFees.card) : '—'} />
              <PeekRow label="정산주기" value={peek.settleCycle} />
              <PeekRow label="정산한도" value={formatKRW(peek.settleLimit)} />
            </dl>
          </div>
        )}
      </div>

      {/* Active bid body */}
      <div className="mt-5 space-y-2">
        {isAwarded && (
          <div className="mb-2">
            <Chip
              label={active.id === awardedBidId ? '선정됨' : '미선정'}
              color={active.id === awardedBidId ? 'tertiary' : 'surface'}
            />
          </div>
        )}

        <ImprovementSummary bid={active} current={current} />

        <Accordion>
          <AccordionItem value="rates" title={`전체 결제수단 요율 (${feeRows.length})`}>
            <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
              {feeRows.map((row) => {
                const ranked = rankByMetric(sortedBids, row.getValue, 'lower');
                const rows: CompareRow[] = ranked.map((r) => ({
                  bid: r.bid,
                  isBest: r.isBest,
                  valueText: r.value !== null ? formatPct(r.value) : '—',
                }));
                const activeValue = row.getValue(active);
                return (
                  <div key={row.key} className="py-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {row.label}
                    </span>
                    <MetricComparePopover
                      label={row.label}
                      rows={rows}
                      activeBidId={active.id}
                      pgWsNameMap={pgWsNameMap}
                      baselineText={row.baseline}
                      onSelect={(wsId) => {
                        const target = sortedBids.find((b) => b.pgWsId === wsId);
                        if (target) setActiveBidId(target.id);
                      }}
                    >
                      <span className="md-numeric text-[13px] font-[600] text-[var(--md-sys-color-on-surface)]">
                        {activeValue !== null ? formatPct(activeValue) : '—'}
                      </span>
                    </MetricComparePopover>
                  </div>
                );
              })}
            </div>
          </AccordionItem>

          <AccordionItem value="pg-memo" title="PG 메모 · 제안서 PDF">
            {active.memo ? (
              <p className="mb-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed whitespace-pre-wrap">
                {active.memo}
              </p>
            ) : (
              <p className="mb-3 font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
                — PG 메모 없음 —
              </p>
            )}
            <BidPdfPane pdf={active.proposalPdfs[0]} />
          </AccordionItem>

          <AccordionItem value="my-notes" title="내 메모">
            <BidNotesPanel bidId={active.id} notes={notesByBid[active.id] ?? []} />
          </AccordionItem>
        </Accordion>

        {canAward && (
          <div className="pt-4 flex justify-end">
            <Button onClick={() => setDialogOpen(true)}>이 견적 선정하기 →</Button>
          </div>
        )}
      </div>

      <AwardConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rfpId={props.rfpId}
        awardedBidId={active.id}
        pgName={pgName(active.pgWsId)}
        otherCount={sortedBids.length - 1}
        onAwarded={() => router.refresh()}
      />
    </section>
  );
}

function PeekRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt>{label}</dt>
      <dd className="md-numeric text-[var(--md-sys-color-on-surface)]">{value}</dd>
    </div>
  );
}
