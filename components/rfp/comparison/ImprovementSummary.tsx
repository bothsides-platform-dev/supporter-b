// 포커스 뷰 hero — 선택된 견적이 "지금 조건 대비 얼마나 좋아지나"를 4지표로 보여준다.
// 카드 수수료·정산주기·월 정산한도·보증보험. 현재 조건(자유 텍스트)이 파싱되면 개선폭
// 배지, 아니면 병기만. 현재 조건이 전혀 없으면 '핵심 수치' 요약으로 강등 + 입력 안내.
import { formatKRW, formatPct } from '@/lib/format';
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
  const verdicts = [
    cardRate !== undefined
      ? metricVerdict(parseCurrentValue(current.feeRate, 'percent'), cardRate, 'lower')
      : null,
    cycleQuality(current.settlementCycle, bid.settleCycle),
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

      <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
        {cardRate !== undefined ? (
          <NumericRow
            testId="metric-row-card"
            label="카드 수수료"
            currentText={current.feeRate}
            proposedText={formatPct(cardRate)}
            badge={feeBadge(current.feeRate, cardRate)}
          />
        ) : null}
        <CycleRow
          testId="metric-row-cycle"
          currentText={current.settlementCycle}
          proposedText={bid.settleCycle}
          quality={cycleQuality(current.settlementCycle, bid.settleCycle)}
        />
        <NumericRow
          testId="metric-row-limit"
          label="월 정산한도"
          currentText={current.settlementLimit}
          proposedText={formatKRW(bid.settleLimit)}
          badge={krwBadge(current.settlementLimit, bid.settleLimit, 'higher')}
        />
        <NumericRow
          testId="metric-row-guarantee"
          label="보증보험"
          currentText={current.guaranteeInsurance}
          proposedText={formatKRW(bid.guaranteeInsurance)}
          badge={krwBadge(current.guaranteeInsurance, bid.guaranteeInsurance, 'lower')}
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

function NumericRow({
  testId,
  label,
  currentText,
  proposedText,
  badge,
}: {
  testId: string;
  label: string;
  currentText?: string | null;
  proposedText: string;
  badge: Badge;
}) {
  return (
    <div data-testid={testId} className="py-2.5 flex items-center justify-between gap-4">
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {currentText ? (
          <>
            <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              {currentText}
            </span>
            <span data-testid="metric-arrow" className="text-[var(--md-sys-color-outline)]">
              →
            </span>
          </>
        ) : null}
        <span className="md-numeric text-[13px] font-[600] text-[var(--md-sys-color-on-surface)]">
          {proposedText}
        </span>
        {badge && <DeltaBadge badge={badge} />}
      </div>
    </div>
  );
}

function CycleRow({
  testId,
  currentText,
  proposedText,
  quality,
}: {
  testId: string;
  currentText?: string | null;
  proposedText: string;
  quality: 'faster' | 'same' | 'slower' | null;
}) {
  return (
    <div data-testid={testId} className="py-2.5 flex items-center justify-between gap-4">
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        정산주기
      </span>
      <div className="flex items-center gap-2">
        {currentText ? (
          <>
            <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              {currentText}
            </span>
            <span data-testid="metric-arrow" className="text-[var(--md-sys-color-outline)]">
              →
            </span>
          </>
        ) : null}
        <span className="md-numeric text-[13px] font-[600] text-[var(--md-sys-color-on-surface)]">
          {proposedText}
        </span>
        {quality && (
          <span
            className={
              quality === 'faster'
                ? 'text-[12px] text-[var(--md-sys-color-tertiary)]'
                : quality === 'slower'
                  ? 'text-[12px] text-[var(--md-sys-color-error)]'
                  : 'text-[12px] text-[var(--md-sys-color-on-surface-variant)]'
            }
          >
            {CYCLE_QUALITY_LABEL[quality]}
          </span>
        )}
      </div>
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
