// 포커스 뷰 hero — 선택된 견적이 "지금 조건 대비 얼마나 좋아지나"를 4지표로 보여준다.
// 카드 수수료·정산주기·월 정산한도·보증보험. 현재 조건(자유 텍스트)이 파싱되면 개선폭
// 배지, 아니면 병기만. 현재 조건이 전혀 없으면 '핵심 수치' 요약으로 강등 + 입력 안내.
import type { ReactNode } from 'react';
import { formatKRW, formatPct, formatKrwField, formatFeeRateDisplay } from '@/lib/format';
import { parseCurrentValue, improvement, metricVerdict, cycleQuality } from '@/lib/utils/bid-compare';
import { getMethodRate, type Bid, type MerchantTier } from '@/lib/types/bid';

export type CurrentConditions = {
  feeRate?: string | null;
  settlementCycle?: string | null;
  settlementLimit?: string | null;
  guaranteeInsurance?: string | null;
};

const CYCLE_QUALITY_LABEL: Record<'faster' | 'same' | 'slower', string> = {
  faster: '더 빠름',
  same: '같음',
  slower: '더 느림',
};

export function ImprovementSummary({
  bid,
  current,
  tier = 'general',
}: {
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
}) {
  const hasAnyCurrent = Boolean(
    current.feeRate || current.settlementCycle || current.settlementLimit || current.guaranteeInsurance,
  );

  // 비교 가능한 지표 중 하나라도 나빠지면 "좋아져요" 단정 대신 중립 헤더로 바꾼다.
  const cardRate = getMethodRate(bid.paymentFees.card, tier);
  const cycleQ = cycleQuality(current.settlementCycle, bid.settleCycle);
  const verdicts = [
    cardRate !== undefined
      ? metricVerdict(parseCurrentValue(current.feeRate, 'percent'), cardRate, 'lower')
      : null,
    cycleQ,
    metricVerdict(parseCurrentValue(current.settlementLimit, 'krw'), bid.settleLimit, 'higher'),
    metricVerdict(parseCurrentValue(current.guaranteeInsurance, 'krw'), bid.guaranteeInsurance, 'lower'),
  ];
  const anyWorse = verdicts.some((v) => v === 'worse' || v === 'slower');

  const heading = !hasAnyCurrent
    ? '핵심 수치'
    : anyWorse
      ? '지금 조건과 비교하면 이렇게 달라져요'
      : '지금 조건보다 이만큼 좋아져요';

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          {heading}
        </span>
        <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
      </div>

      {!hasAnyCurrent && (
        <p className="mb-3 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          현재 조건을 입력하면 개선폭을 보여드려요.
        </p>
      )}

      {/* 라벨·현재값·화살표·제안값·개선폭을 5열 그리드로 묶어 행끼리 열을 정렬한다.
          각 행은 grid-cols-subgrid 로 부모 열을 그대로 물려받아 같은 세로선에 맞춰진다. */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 border-t border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
        {cardRate !== undefined ? (
          <MetricRow
            testId="metric-row-card"
            label="카드 수수료"
            currentText={formatFeeRateDisplay(current.feeRate)}
            proposedText={formatPct(cardRate)}
            trailing={badgeNode(feeBadge(current.feeRate, cardRate))}
          />
        ) : null}
        <MetricRow
          testId="metric-row-cycle"
          label="정산주기"
          currentText={current.settlementCycle}
          proposedText={bid.settleCycle}
          trailing={qualityNode(cycleQ)}
        />
        <MetricRow
          testId="metric-row-limit"
          label="월 정산한도"
          currentText={formatKrwField(current.settlementLimit)}
          proposedText={formatKRW(bid.settleLimit)}
          trailing={badgeNode(krwBadge(current.settlementLimit, bid.settleLimit, 'higher'))}
        />
        <MetricRow
          testId="metric-row-guarantee"
          label="보증보험"
          currentText={formatKrwField(current.guaranteeInsurance)}
          proposedText={formatKRW(bid.guaranteeInsurance)}
          trailing={badgeNode(krwBadge(current.guaranteeInsurance, bid.guaranteeInsurance, 'lower'))}
        />
      </div>
    </section>
  );
}

function feeBadge(currentText: string | null | undefined, proposed: number) {
  const current = parseCurrentValue(currentText, 'percent');
  const imp = improvement(current, proposed, 'lower');
  if (!imp || current === null) return null;
  return { text: `${(imp.deltaAbs * 100).toFixed(2)}%p`, down: proposed < current, better: imp.better };
}

function krwBadge(
  currentText: string | null | undefined,
  proposed: number,
  direction: 'lower' | 'higher',
) {
  const current = parseCurrentValue(currentText, 'krw');
  const imp = improvement(current, proposed, direction);
  if (!imp || current === null) return null;
  return { text: formatKRW(imp.deltaAbs), down: proposed < current, better: imp.better };
}

type Badge = { text: string; down: boolean; better: boolean } | null;

// 마지막 열(개선폭) 노드 — 수치형 지표는 델타 배지, 정산주기는 정성 평가 텍스트.
function badgeNode(badge: Badge): ReactNode {
  return badge ? <DeltaBadge badge={badge} /> : null;
}

function qualityNode(quality: 'faster' | 'same' | 'slower' | null): ReactNode {
  if (!quality) return null;
  const color =
    quality === 'faster'
      ? 'text-[var(--md-sys-color-tertiary)]'
      : quality === 'slower'
        ? 'text-[var(--md-sys-color-error)]'
        : 'text-[var(--md-sys-color-on-surface-variant)]';
  return <span className={`text-[12px] ${color}`}>{CYCLE_QUALITY_LABEL[quality]}</span>;
}

// 한 지표 행 = subgrid 5칸. 현재값이 없으면 현재값·화살표 칸을 빈 셀로 두어 열 정렬을 유지한다.
function MetricRow({
  testId,
  label,
  currentText,
  proposedText,
  trailing,
}: {
  testId: string;
  label: string;
  currentText?: string | null;
  proposedText: string;
  trailing?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="col-span-full grid grid-cols-subgrid items-center py-2.5"
    >
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      {currentText ? (
        <span className="md-numeric text-[13px] text-right text-[var(--md-sys-color-on-surface-variant)]">
          {currentText}
        </span>
      ) : (
        <span />
      )}
      {currentText ? (
        <span data-testid="metric-arrow" className="text-center text-[var(--md-sys-color-outline)]">
          →
        </span>
      ) : (
        <span />
      )}
      <span className="md-numeric text-[13px] font-[600] text-[var(--md-sys-color-on-surface)]">
        {proposedText}
      </span>
      <span>{trailing}</span>
    </div>
  );
}

function DeltaBadge({ badge }: { badge: NonNullable<Badge> }) {
  return (
    <span
      className={
        badge.better
          ? 'md-numeric text-[12px] text-[var(--md-sys-color-tertiary)]'
          : 'md-numeric text-[12px] text-[var(--md-sys-color-error)]'
      }
    >
      {badge.down ? '↓' : '↑'}
      {badge.text}
    </span>
  );
}
