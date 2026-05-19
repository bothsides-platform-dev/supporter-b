'use client';

import { useState, useMemo } from 'react';
import { Slider } from '@/components/ui/slider';
import { KpiCell } from '@/components/primitives/KpiCell';
import { Chip } from '@/components/primitives/Chip';
import { CostComparisonChart } from '@/components/landing/CostComparisonChart';
import { formatKRW } from '@/lib/format';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import {
  SUPPORTER_B_RATE,
  GENERAL_ASSUMED_RATE,
  annualMaxSavings,
  gradeFromVolume,
} from '@/lib/landing/savings';

const VOL_T_MAX = 1000;
const VOL_BASE = 1e8;
const VOL_DECADES = 3;
const DEFAULT_VOL_T = 492;

const RATE_DEFAULT = 240;
const RATE_MIN = 50;
const RATE_MAX = 400;
const RATE_STEP = 5;

function tToVolume(t: number): number {
  return VOL_BASE * Math.pow(10, (t / VOL_T_MAX) * VOL_DECADES);
}

function formatVolume(v: number): string {
  const eok = v / 1e8;
  if (eok < 10) return `${eok.toFixed(1)} 억`;
  if (eok < 100) return `${Math.round(eok).toLocaleString('ko-KR')} 억`;
  return `${Math.round(eok).toLocaleString('ko-KR')} 억`;
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)} %`;
}

export function SavingsCalculator() {
  const [volT, setVolT] = useState(DEFAULT_VOL_T);
  const [rateBp, setRateBp] = useState(RATE_DEFAULT);

  const volume = useMemo(() => tToVolume(volT), [volT]);
  const currentRate = rateBp / 10000;
  const grade = gradeFromVolume(volume);
  const supporterBRate = SUPPORTER_B_RATE[grade];
  const savings = annualMaxSavings(volume, currentRate);
  const currentCost = Math.round(currentRate * volume);
  const supporterBCost = Math.round(supporterBRate * volume);

  const baselineRate = grade === 'general' ? GENERAL_ASSUMED_RATE : supporterBRate;
  const baselineNote = `최저가능 ${(baselineRate * 100).toFixed(2)}%`;

  return (
    <section className="border-t border-b border-[var(--md-sys-color-outline)] py-[var(--s-9)]">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-[var(--s-9)] md:gap-[var(--s-10)] items-end">
        {/* Sliders */}
        <div className="flex flex-col gap-[var(--s-8)]">
          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[var(--text-xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">연간 거래액</span>
              <span className="font-mono tabular-nums text-[var(--text-base)] text-[var(--md-sys-color-on-surface)] tracking-[0.02em]">
                {formatVolume(volume)}
              </span>
            </div>
            <Slider
              value={volT}
              min={0}
              max={VOL_T_MAX}
              step={1}
              onValueChange={setVolT}
              ariaLabel="연간 거래액"
            />
            <div className="flex justify-between font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-outline)] uppercase">
              <span>1 억</span>
              <span>1,000 억</span>
            </div>
          </div>

          <div className="flex flex-col gap-[var(--s-3)]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[var(--text-xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">현재 PG 수수료율</span>
              <span className="font-mono tabular-nums text-[var(--text-base)] text-[var(--md-sys-color-on-surface)] tracking-[0.02em]">
                {formatRate(rateBp / 100)}
              </span>
            </div>
            <Slider
              value={rateBp}
              min={RATE_MIN}
              max={RATE_MAX}
              step={RATE_STEP}
              onValueChange={setRateBp}
              ariaLabel="현재 PG 수수료율"
            />
            <div className="flex justify-between font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-outline)] uppercase">
              <span>0.50 %</span>
              <span>4.00 %</span>
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="flex flex-col gap-[var(--s-3)] md:items-end md:text-right md:min-w-[360px]">
          <KpiCell
            label="EST. ANNUAL SAVINGS"
            value={formatKRW(savings)}
          />
          <div className="flex items-center gap-3 md:justify-end">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              가맹점 등급
            </span>
            <Chip label={GRADE_LABELS[grade]} color="surface" />
          </div>
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)]">
            {baselineNote}
          </span>
        </div>
      </div>

      <div className="mt-[var(--s-9)] pt-[var(--s-7)] border-t border-[var(--md-sys-color-outline-variant)]">
        <CostComparisonChart
          currentCost={currentCost}
          supporterBCost={supporterBCost}
          currentRatePct={currentRate * 100}
          supporterBRatePct={supporterBRate * 100}
        />
      </div>

      <p className="mt-[var(--s-7)] font-mono text-[var(--text-2xs)] tracking-[0.06em] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
        * 최대 절감 가능액 추정치입니다. 일반 등급(연 30억 초과)은{' '}
        {(GENERAL_ASSUMED_RATE * 100).toFixed(2)}% 가정(최저 가능 수준).
        영세·중소 등급의 카드 수수료는 법정 고정으로, 실 절감은 카드 외
        항목(정산주기·보증금·셋업비 등)에서 발생합니다. 실제 절감액은 입찰
        결과에 따라 다릅니다.
      </p>
    </section>
  );
}
