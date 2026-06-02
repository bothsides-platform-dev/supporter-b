'use client';

import { useState } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  STATUTORY_CARD_FEE,
} from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/format';
import type { Bid, CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';
import { compareSettleCycle } from '@/lib/utils/settle-cycle';
import { EnvelopeIcon } from '@/components/icons';
import { MessageComposeButton } from '@/components/messages/MessageComposeButton';
import Link from 'next/link';

// 'pm:<method>' = enum 결제수단 컬럼, 'cf:<id>' = 커스텀 결제수단 컬럼.
type SortKey = 'name' | 'settle' | 'settleLimit' | 'guaranteeInsurance' | string;
type SortDir = 'asc' | 'desc';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

// 결제수단 컬럼 서술자. 카드는 capped 등급이면 법정 고정값(bid 무관)을 표시.
type PayCol =
  | { kind: 'card-statutory'; key: string; label: string; fee: number }
  | { kind: 'enum'; key: string; label: string; method: PaymentMethod }
  | { kind: 'custom'; key: string; label: string; id: string };

function feeOf(bid: Bid, col: PayCol): number | undefined {
  if (col.kind === 'card-statutory') return col.fee;
  if (col.kind === 'enum') return bid.paymentFees[col.method];
  return bid.customFees[col.id];
}

function min(bids: Bid[], key: (b: Bid) => number): number {
  return Math.min(...bids.map(key));
}

function SortTh({
  label, sortId, active, dir, onSort,
}: {
  label: string;
  sortId: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal cursor-pointer hover:text-[var(--md-sys-color-on-surface)] transition-colors select-none"
      onClick={() => onSort(sortId)}
    >
      {label}
      {active && <span className="ml-1 text-[var(--md-sys-color-on-surface)]">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

type Props = {
  rfpId: string;
  bids: Bid[];
  grade: MerchantGrade | undefined;
  rfpStatus: string;
  awardedBidId?: string;
  requiredPaymentMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  /** pgWsId → workspace name. RSC 호출자가 dedup된 id 목록으로 미리 채움. */
  pgWsNameMap: Record<string, string>;
};

export function BidComparisonTable({
  rfpId,
  bids,
  grade,
  rfpStatus,
  awardedBidId,
  requiredPaymentMethods,
  customPaymentMethods,
  pgWsNameMap,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('settle');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const pgName = (wsId: string): string => pgWsNameMap[wsId] ?? wsId;

  if (bids.length === 0) {
    return (
      <EmptyState
        icon={<EnvelopeIcon size={32} />}
        title="제안을 기다리는 중이에요."
        description={
          rfpStatus === 'sent'
            ? '초대된 PG가 제안을 제출하면 비교표가 표시돼요.'
            : 'RFP를 발송하면 제안을 받을 수 있어요.'
        }
        className="py-12"
      />
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const cardFee = grade && grade !== 'general' ? STATUTORY_CARD_FEE[grade] : null;

  // 표시할 결제수단 컬럼: 요청 목록(빈 배열=제한 없음→9종 전체) + 커스텀.
  // 카드는 capped 등급이면 법정 고정값 컬럼으로, 그 외엔 일반 enum 컬럼으로.
  const enumMethods = requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const payCols: PayCol[] = [
    ...enumMethods.map((m): PayCol =>
      m === 'card' && cardFee !== null
        ? { kind: 'card-statutory', key: `pm:card`, label: '카드', fee: cardFee }
        : { kind: 'enum', key: `pm:${m}`, label: PAYMENT_METHOD_LABELS[m], method: m },
    ),
    ...customPaymentMethods.map((c): PayCol => ({
      kind: 'custom',
      key: `cf:${c.id}`,
      label: c.label,
      id: c.id,
    })),
  ];

  const colByKey = (key: string) => payCols.find((c) => c.key === key);

  const sorted = [...bids].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name': return mul * pgName(a.pgWsId).localeCompare(pgName(b.pgWsId), 'ko');
      case 'settle': return mul * compareSettleCycle(a.settleCycle, b.settleCycle);
      case 'settleLimit': return mul * (a.settleLimit - b.settleLimit);
      case 'guaranteeInsurance': return mul * (a.guaranteeInsurance - b.guaranteeInsurance);
      default: {
        const col = colByKey(sortKey);
        if (!col) return 0;
        return mul * ((feeOf(a, col) ?? 0) - (feeOf(b, col) ?? 0));
      }
    }
  });

  const minSettleLimit = min(bids, (b) => b.settleLimit);
  const minGuarantee = min(bids, (b) => b.guaranteeInsurance);
  const minByCol: Record<string, number> = {};
  for (const col of payCols) {
    if (col.kind === 'card-statutory') continue; // 법정 고정값은 강조 대상 아님
    minByCol[col.key] = min(bids, (b) => feeOf(b, col) ?? Infinity);
  }
  const bestSettle = sorted[0]?.settleCycle ?? '';

  const canAward = rfpStatus === 'sent';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <SortTh label="PG사" sortId="name" active={sortKey === 'name'} dir={sortDir} onSort={handleSort} />
            <SortTh label="정산주기" sortId="settle" active={sortKey === 'settle'} dir={sortDir} onSort={handleSort} />
            <SortTh label="정산한도" sortId="settleLimit" active={sortKey === 'settleLimit'} dir={sortDir} onSort={handleSort} />
            <SortTh label="보증보험" sortId="guaranteeInsurance" active={sortKey === 'guaranteeInsurance'} dir={sortDir} onSort={handleSort} />
            {payCols.map((col) =>
              col.kind === 'card-statutory' ? (
                <th
                  key={col.key}
                  className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal"
                >
                  {col.label}
                </th>
              ) : (
                <SortTh
                  key={col.key}
                  label={col.label}
                  sortId={col.key}
                  active={sortKey === col.key}
                  dir={sortDir}
                  onSort={handleSort}
                />
              ),
            )}
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((bid) => {
            return (
              <tr
                key={bid.id}
                className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              >
                <td className="relative px-3 py-4 group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-0.5 group-hover:before:bg-[var(--md-sys-color-warning)]">
                  <div className="flex items-center">
                    <MessageComposeButton
                      variant="profile"
                      counterparty={{ name: pgName(bid.pgWsId), type: 'pg', workspaceId: bid.pgWsId }}
                    />
                    {bid.proposalPdfs.length > 0 && (
                      <span className="ml-2 font-mono text-[10px] text-[var(--md-sys-color-outline)]">PDF</span>
                    )}
                  </div>
                </td>
                <Num label={bid.settleCycle} best={sortKey === 'settle' && bid.settleCycle === bestSettle} />
                <Num label={formatKRW(bid.settleLimit)} best={bid.settleLimit === minSettleLimit} />
                <Num label={formatKRW(bid.guaranteeInsurance)} best={bid.guaranteeInsurance === minGuarantee} />
                {payCols.map((col) => {
                  if (col.kind === 'card-statutory') {
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]"
                      >
                        {formatPct(col.fee)}
                      </td>
                    );
                  }
                  const fee = feeOf(bid, col);
                  return (
                    <Num
                      key={col.key}
                      label={fee !== undefined ? formatPct(fee) : '—'}
                      best={fee !== undefined && fee === minByCol[col.key]}
                    />
                  );
                })}
                <td className="px-3 py-4 text-right">
                  {canAward && (
                    <Link href={`/rfp/${rfpId}/award?bidId=${bid.id}`}>
                      <Button variant="outlined" size="sm">선택</Button>
                    </Link>
                  )}
                  {!canAward && awardedBidId === bid.id && (
                    <Chip label="수주" color="tertiary" />
                  )}
                  {!canAward && awardedBidId && awardedBidId !== bid.id && (
                    <Chip label="미선정" color="surface" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {cardFee !== null && grade && (
        <p className="mt-3 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          카드 {(cardFee * 100).toFixed(2)}% — {GRADE_LABELS[grade]} 법정 고정수수료 (PG 변경 불가)
        </p>
      )}
    </div>
  );
}

function Num({ label, best }: { label: string; best: boolean }) {
  return (
    <td className={`px-3 py-4 font-mono text-[12px] tabular-nums ${best ? 'text-[var(--md-sys-color-tertiary)] font-medium' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
      {label}
      {best && <span className="ml-1 text-[9px] opacity-60">▼</span>}
    </td>
  );
}
