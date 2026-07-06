'use client';

// 활성 견적의 구간별(영세~일반) 요율 매트릭스 — 카드·간편결제 등 tiered 수단마다 한 표.
// 표현 전용. memo 로 감싸 hover/tier 외 상태 변화에서 재렌더를 줄인다.
import { memo } from 'react';
import {
  getMethodRate,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  PAYMENT_METHOD_LABELS,
  type Bid,
  type PaymentMethod,
} from '@/lib/types/bid';
import { formatPct } from '@/lib/utils/format';

function FeeMatrixTablesImpl({ active }: { active: Bid }) {
  return (
    <>
      {(Object.keys(active.paymentFees) as PaymentMethod[])
        .filter((m) => typeof active.paymentFees[m] === 'object')
        .map((m) => (
          <table key={m} data-testid={`tiered-matrix-${m}`} className="w-full mb-3 border-collapse">
            <caption className="text-left font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-1">
              {PAYMENT_METHOD_LABELS[m]} · 구간별
            </caption>
            <thead>
              <tr>
                {MERCHANT_TIERS.map((t) => (
                  <th key={t} className="text-center font-mono text-[10px] text-[var(--md-sys-color-outline)] pb-0.5">
                    {MERCHANT_TIER_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {MERCHANT_TIERS.map((t) => {
                  const r = getMethodRate(active.paymentFees[m], t);
                  return (
                    <td key={t} className="text-center md-numeric text-[12px] text-[var(--md-sys-color-on-surface)] py-0.5">
                      {r !== undefined ? formatPct(r) : '—'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        ))}
    </>
  );
}

export const FeeMatrixTables = memo(FeeMatrixTablesImpl);
