'use client';

import { useState } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { Button } from '@/components/primitives/Button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import { formatKRW, formatPct } from '@/lib/format';
import type { Bid } from '@/lib/types/bid';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';
import { EnvelopeIcon } from '@/components/icons';
import Link from 'next/link';

type SortKey = 'name' | 'settle' | 'deposit' | 'setupFee' | 'monthlyMin' | 'bankPct' | 'easyPayPct';
type SortDir = 'asc' | 'desc';

const SETTLE_ORDER: Record<string, number> = { 'D+0': 0, 'D+1': 1, 'D+2': 2, weekly: 3, monthly: 4 };
const SETTLE_LABEL: Record<string, string> = {
  'D+0': 'D+0', 'D+1': 'D+1', 'D+2': 'D+2', weekly: '주1회', monthly: '월1회',
};

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
  /** pgWsId → workspace name. RSC 호출자가 dedup된 id 목록으로 미리 채움. */
  pgWsNameMap: Record<string, string>;
};

export function BidComparisonTable({ rfpId, bids, grade, rfpStatus, awardedBidId, pgWsNameMap }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('settle');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const pgName = (wsId: string): string => pgWsNameMap[wsId] ?? wsId;

  if (bids.length === 0) {
    return (
      <EmptyState
        icon={<EnvelopeIcon size={32} />}
        title="아직 받은 제안이 없습니다."
        description={
          rfpStatus === 'sent'
            ? '초대된 PG가 제안을 제출하면 비교표가 표시됩니다.'
            : 'RFP가 아직 발송되지 않았습니다.'
        }
        className="py-12"
      />
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...bids].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name': return mul * pgName(a.pgWsId).localeCompare(pgName(b.pgWsId), 'ko');
      case 'settle': return mul * (SETTLE_ORDER[a.settleCycle] - SETTLE_ORDER[b.settleCycle]);
      case 'deposit': return mul * (a.deposit - b.deposit);
      case 'setupFee': return mul * (a.setupFee - b.setupFee);
      case 'monthlyMin': return mul * (a.monthlyMin - b.monthlyMin);
      case 'bankPct': return mul * (a.bankTransferFeePct - b.bankTransferFeePct);
      case 'easyPayPct': return mul * (a.easyPayFeePct - b.easyPayFeePct);
    }
  });

  const minDeposit = min(bids, (b) => b.deposit);
  const minSetup = min(bids, (b) => b.setupFee);
  const minMonthly = min(bids, (b) => b.monthlyMin);
  const minBank = min(bids, (b) => b.bankTransferFeePct);
  const minEasyPay = min(bids, (b) => b.easyPayFeePct);
  const minSettle = min(bids, (b) => SETTLE_ORDER[b.settleCycle]);

  const cardFee = grade && grade !== 'general' ? STATUTORY_CARD_FEE[grade] : null;
  const canAward = rfpStatus === 'sent';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
            <SortTh label="PG사" sortId="name" active={sortKey === 'name'} dir={sortDir} onSort={handleSort} />
            <SortTh label="정산주기" sortId="settle" active={sortKey === 'settle'} dir={sortDir} onSort={handleSort} />
            <SortTh label="보증금" sortId="deposit" active={sortKey === 'deposit'} dir={sortDir} onSort={handleSort} />
            <SortTh label="셋업비" sortId="setupFee" active={sortKey === 'setupFee'} dir={sortDir} onSort={handleSort} />
            <SortTh label="월최저" sortId="monthlyMin" active={sortKey === 'monthlyMin'} dir={sortDir} onSort={handleSort} />
            {cardFee !== null && (
              <th className="px-3 py-3 text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] font-normal">
                카드
              </th>
            )}
            <SortTh label="계좌이체" sortId="bankPct" active={sortKey === 'bankPct'} dir={sortDir} onSort={handleSort} />
            <SortTh label="간편결제" sortId="easyPayPct" active={sortKey === 'easyPayPct'} dir={sortDir} onSort={handleSort} />
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((bid) => {
            const isMinSettle = SETTLE_ORDER[bid.settleCycle] === minSettle;
            return (
              <tr
                key={bid.id}
                className="group border-b border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              >
                <td className="relative px-3 py-4 text-[13px] font-medium text-[var(--md-sys-color-on-surface)] group-hover:before:absolute group-hover:before:left-0 group-hover:before:top-0 group-hover:before:bottom-0 group-hover:before:w-0.5 group-hover:before:bg-[var(--md-sys-color-warning)]">
                  {pgName(bid.pgWsId)}
                  {bid.proposalPdfs.length > 0 && (
                    <span className="ml-2 font-mono text-[10px] text-[var(--md-sys-color-outline)]">PDF</span>
                  )}
                </td>
                <Num label={SETTLE_LABEL[bid.settleCycle]} best={isMinSettle} />
                <Num label={formatKRW(bid.deposit)} best={bid.deposit === minDeposit} />
                <Num label={formatKRW(bid.setupFee)} best={bid.setupFee === minSetup} />
                <Num label={formatKRW(bid.monthlyMin)} best={bid.monthlyMin === minMonthly} />
                {cardFee !== null && (
                  <td className="px-3 py-4 font-mono text-[12px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                    {formatPct(cardFee)}
                  </td>
                )}
                <Num label={formatPct(bid.bankTransferFeePct)} best={bid.bankTransferFeePct === minBank} />
                <Num label={formatPct(bid.easyPayFeePct)} best={bid.easyPayFeePct === minEasyPay} />
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
