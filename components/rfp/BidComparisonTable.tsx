'use client';

import { useState } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
} from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/format';
import type { Bid, CustomPaymentMethod, PaymentMethod } from '@/lib/types/bid';
import { compareSettleCycle } from '@/lib/utils/settle-cycle';
import { EnvelopeIcon } from '@/components/icons';
import { InfoTip } from '@/components/ui/info-tip';
import { MessageComposeButton } from '@/components/messages/MessageComposeButton';
import Link from 'next/link';

// 'pm:<method>' = enum 결제수단 컬럼, 'cf:<id>' = 커스텀 결제수단 컬럼.
type SortKey = 'name' | 'settle' | 'settleLimit' | 'guaranteeInsurance' | string;
type SortDir = 'asc' | 'desc';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

// 결제수단 컬럼 서술자. 카드 포함 모든 수단은 bid의 요율을 그대로 표시.
type PayCol =
  | { kind: 'enum'; key: string; label: string; method: PaymentMethod }
  | { kind: 'custom'; key: string; label: string; id: string };

function feeOf(bid: Bid, col: PayCol): number | undefined {
  if (col.kind === 'enum') return bid.paymentFees[col.method];
  return bid.customFees[col.id];
}

function min(bids: Bid[], key: (b: Bid) => number): number {
  return Math.min(...bids.map(key));
}

function SortTh({
  label, sortId, active, dir, onSort, infoTerm,
}: {
  label: string;
  sortId: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  /** 헤더 옆 ⓘ 설명 아이콘 용어집 키. 아이콘 클릭은 정렬을 일으키지 않음 */
  infoTerm?: string;
}) {
  return (
    <th
      className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal cursor-pointer hover:text-[var(--md-sys-color-on-surface)] transition-colors select-none"
      onClick={() => onSort(sortId)}
    >
      <span className="inline-flex items-center gap-1 align-middle">
        {label}
        {infoTerm && <InfoTip term={infoTerm} side="bottom" />}
      </span>
      {active && <span className="ml-1 text-[var(--md-sys-color-on-surface)]">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

type Props = {
  rfpId: string;
  bids: Bid[];
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
        title="견적을 기다리고 있어요."
        description={
          rfpStatus === 'sent'
            ? '초대한 PG가 견적을 보내면 비교표가 표시돼요.'
            : '견적 요청을 보내면 견적을 받을 수 있어요.'
        }
        className="py-12"
      />
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // 표시할 결제수단 컬럼: 요청 목록(빈 배열=제한 없음→9종 전체) + 커스텀.
  // 카드 포함 모든 enum 수단은 bid의 협상 요율을 표시한다.
  const enumMethods = requiredPaymentMethods.length > 0 ? requiredPaymentMethods : ALL_PAYMENT_METHODS;
  const payCols: PayCol[] = [
    ...enumMethods.map((m): PayCol => ({
      kind: 'enum',
      key: `pm:${m}`,
      label: PAYMENT_METHOD_LABELS[m],
      method: m,
    })),
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
            <SortTh label="정산주기" sortId="settle" active={sortKey === 'settle'} dir={sortDir} onSort={handleSort} infoTerm="정산주기" />
            <SortTh label="정산한도" sortId="settleLimit" active={sortKey === 'settleLimit'} dir={sortDir} onSort={handleSort} infoTerm="정산한도" />
            <SortTh label="보증보험" sortId="guaranteeInsurance" active={sortKey === 'guaranteeInsurance'} dir={sortDir} onSort={handleSort} infoTerm="보증보험" />
            {payCols.map((col) => (
              <SortTh
                key={col.key}
                label={col.label}
                sortId={col.key}
                active={sortKey === col.key}
                dir={sortDir}
                onSort={handleSort}
              />
            ))}
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
                      <Button variant="outlined" size="sm">선정하기</Button>
                    </Link>
                  )}
                  {!canAward && awardedBidId === bid.id && (
                    <Chip label="선정됨" color="tertiary" />
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
