'use client';

import { motion } from 'motion/react';
import { formatKRW } from '@/lib/utils/format';

type CostComparisonChartProps = {
  currentCost: number;
  supporterBCost: number;
};

export function CostComparisonChart({
  currentCost,
  supporterBCost,
}: CostComparisonChartProps) {
  const max = Math.max(currentCost, supporterBCost, 1);
  const currentRatio = currentCost / max;
  const supporterBRatio = supporterBCost / max;

  return (
    <div className="flex flex-col gap-[var(--s-5)]">
      <div className="flex items-baseline justify-between gap-x-2 gap-y-1 flex-wrap">
        <span className="font-mono text-[var(--text-2xs)] tracking-[0.06em] md:tracking-[0.18em] uppercase whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">
          ANNUAL PG COST
        </span>
        <span className="font-mono text-[var(--text-2xs)] tracking-[0.04em] md:tracking-[0.1em] whitespace-nowrap text-[var(--md-sys-color-outline)]">
          단위 ₩ / 연
        </span>
      </div>

      <div className="flex flex-col gap-[var(--s-4)]">
        <BarRow
          label="현재"
          ratio={currentRatio}
          cost={currentCost}
          variant="current"
        />
        <BarRow
          label="서포트비"
          ratio={supporterBRatio}
          cost={supporterBCost}
          variant="supporter-b"
        />
      </div>
    </div>
  );
}

type BarRowProps = {
  label: string;
  ratio: number;
  cost: number;
  variant: 'current' | 'supporter-b';
};

function BarRow({ label, ratio, cost, variant }: BarRowProps) {
  const fillClass =
    variant === 'current'
      ? 'bg-[var(--md-sys-color-outline)]'
      : 'bg-[var(--md-sys-color-on-surface)]';
  const labelClass =
    variant === 'current'
      ? 'text-[var(--md-sys-color-on-surface-variant)]'
      : 'text-[var(--md-sys-color-on-surface)]';

  return (
    <div className="flex flex-col gap-[var(--s-2)]">
      <div className="flex items-baseline justify-between gap-x-2 gap-y-1 flex-wrap">
        <span
          className={`font-mono text-[var(--text-xs)] tracking-[0.04em] md:tracking-[0.16em] uppercase whitespace-nowrap ${labelClass}`}
        >
          {label}
        </span>
        <span className="font-mono tabular-nums text-[var(--text-base)] tracking-[0.02em] whitespace-nowrap text-[var(--md-sys-color-on-surface)]">
          {formatKRW(cost)}
        </span>
      </div>
      <div className="relative h-[14px] border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface)]">
        <motion.div
          className={`absolute inset-y-0 left-0 ${fillClass}`}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
