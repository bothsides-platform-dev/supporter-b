import { bidConditions, formatCondition } from '@/lib/quote/terms';
// 포커스 뷰 hero — 선택된 견적이 "지금 조건 대비 얼마나 좋아지나"를 4지표로 보여준다.
// 갱신은 구매사의 현재 조건과 비교하고, 신규는 같은 PG·등급의 홈페이지 판가와
// 카드 수수료만 비교한다. 비교 근거가 없으면 받은 견적만 보여준다.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatKRW, formatPct, formatKrwField, formatFeeRateDisplay } from '@/lib/utils/format';
import {
  parseCurrentValue,
  improvement,
  metricVerdict,
  cycleQuality,
} from '@/lib/utils/bid-compare';
import { getMethodRate, type Bid, type MerchantTier } from '@/lib/types/bid';
import { InfoTip } from '@/components/ui/info-tip';

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
  current: savedCurrent,
  tier = 'general',
  flash,
  showCurrentHint = true,
  contractType,
  homepageCardRate,
}: {
  bid: Bid;
  current: CurrentConditions;
  tier?: MerchantTier;
  flash?: boolean;
  /** 선정 완료 화면에서는 수정할 수 없는 현재 조건 입력 안내를 숨긴다. */
  showCurrentHint?: boolean;
  contractType?: 'new' | 'renewal' | null;
  /** 같은 PG·조회 구간의 홈페이지 카드 판가. 소수 요율·부가세 별도이며 0도 유효하다. */
  homepageCardRate?: number | null;
}) {
  const homepageComparison = contractType === 'new';
  // 과거 데이터에 신규의 현재 조건이 남아 있어도 비교 근거로 사용하지 않는다.
  const current: CurrentConditions = homepageComparison ? {} : savedCurrent;
  const homepageRate = typeof homepageCardRate === 'number' && Number.isFinite(homepageCardRate)
    && homepageCardRate >= 0 && homepageCardRate <= 1 ? homepageCardRate : null;
  const baselineCardRate = homepageComparison ? homepageRate : parseCurrentValue(current.feeRate, 'percent');
  const hasAnyCurrent = Boolean(
    current.feeRate ||
    current.settlementCycle ||
    current.settlementLimit ||
    current.guaranteeInsurance,
  );

  // 비교 가능한 지표 중 하나라도 나빠지면 "좋아져요" 단정 대신 중립 헤더로 바꾼다.
  const cardRate = getMethodRate(bid.paymentFees.card, tier);
  const cycleQ = cycleQuality(current.settlementCycle, bid.settleCycle);
  const verdicts = [
    cardRate !== undefined
      ? metricVerdict(baselineCardRate, cardRate, 'lower')
      : null,
    cycleQ,
    metricVerdict(parseCurrentValue(current.settlementLimit, 'krw'), bid.settleLimit, 'higher'),
  ];
  const anyWorse = verdicts.some((v) => v === 'worse' || v === 'slower');

  const heading = homepageComparison
    ? homepageRate === null
      ? '핵심 수치'
      : verdicts[0] === 'better'
        ? '홈페이지 판가보다 이만큼 좋아져요'
        : '홈페이지 판가와 비교한 조건이에요'
    : !hasAnyCurrent
    ? '핵심 수치'
    : anyWorse || !verdicts.some((v) => v === 'better' || v === 'faster')
      ? '지금 조건과 비교하면 이렇게 달라져요'
      : '지금 조건보다 이만큼 좋아져요';

  return (
    <section className="@container/summary">
      <div className="mb-3 space-y-1">
        <h2 className="text-[18px] font-semibold leading-snug tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] text-balance">
          {heading}
        </h2>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {homepageComparison && homepageRate !== null
            ? '같은 등급의 카드 수수료를 비교해요. 부가세는 별도예요.'
            : '수수료는 부가세 별도예요.'}
        </p>
      </div>

      {homepageComparison && homepageRate === null && (
        <p className="mb-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          이 구간의 홈페이지 판가가 없어 받은 견적만 보여드려요.
        </p>
      )}
      {!homepageComparison && !hasAnyCurrent && showCurrentHint && (
        <p className="mb-3 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
          현재 조건을 입력하면 개선폭을 보여드려요.
        </p>
      )}

      {/* 라벨·현재값·화살표·제안값·개선폭을 5열 그리드로 묶어 행끼리 열을 정렬한다.
          각 행은 grid-cols-subgrid 로 부모 열을 그대로 물려받아 같은 세로선에 맞춰진다. */}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-4 divide-y divide-[var(--md-sys-color-outline-variant)] @max-[620px]/summary:block">
        {
          <MetricRow
            testId="metric-row-card"
            label="카드 수수료"
            emphasized
            infoTerm="수수료율"
            currentLabel={homepageComparison ? '홈페이지 판가' : '현재 조건'}
            currentText={homepageComparison
              ? homepageRate === null ? undefined : formatPct(homepageRate)
              : formatFeeRateDisplay(current.feeRate)}
            proposedText={
              cardRate === undefined
                ? formatCondition(bidConditions(bid).fees[`card:${tier}`], '%')
                : formatPct(cardRate)
            }
            proposedNumeric={cardRate !== undefined}
            trailing={
              cardRate === undefined ? null : badgeNode(feeBadge(baselineCardRate, cardRate))
            }
            proposedFlash={flash}
            proposedFlashTestId="flash-card-fee"
          />
        }
        <MetricRow
          testId="metric-row-cycle"
          label="정산주기"
          infoTerm="정산주기"
          currentText={current.settlementCycle}
          proposedText={bid.settleCycle}
          trailing={qualityNode(cycleQ)}
        />
        <MetricRow
          testId="metric-row-limit"
          label="월 정산한도"
          infoTerm="정산한도"
          currentText={formatKrwField(current.settlementLimit)}
          proposedText={formatKRW(bid.settleLimit)}
          trailing={badgeNode(krwBadge(current.settlementLimit, bid.settleLimit, 'higher'))}
        />
        <MetricRow
          testId="metric-row-guarantee"
          label="보증보험 금액(원)"
          currentText={formatKrwField(current.guaranteeInsurance)}
          proposedText={formatCondition(bidConditions(bid).guaranteeInsurance)}
          proposedNumeric={bidConditions(bid).guaranteeInsurance.state === 'confirmed'}
        />
        {/* 가입비는 나머지 네 지표와 성격이 다르다 — 구매사가 "현재 가입비"를 적는 곳이
            없어(CurrentTermsV1 에 키 자체가 없다) 비교 기준선이 없고, 1회성이라 반복 비용인
            수수료와 같은 축에 놓이지도 않는다. 그래서 배지도, 위 헤딩의 개선 판정도 붙지
            않는다. 캐비앗은 **라벨 밑**에 둔다 — 마지막 열은 개선폭 전용이라 거기에 분류
            문구를 끼우면 세로로 훑을 때 판정으로 오독된다(가입비가 그만큼 좋아졌다는 식). */}
        <MetricRow
          testId="metric-row-signup"
          label="가입비"
          labelNote={homepageComparison ? '처음 한 번만 내는 비용이에요' : '한 번만 내는 비용이라 위 비교에 넣지 않았어요'}
          proposedText={formatCondition(bidConditions(bid).signupFee)}
          proposedNumeric={bidConditions(bid).signupFee.state === 'confirmed'}
        />
      </dl>
    </section>
  );
}

function feeBadge(current: number | null, proposed: number) {
  const imp = improvement(current, proposed, 'lower');
  if (!imp || current === null || imp.deltaAbs === 0) return null;
  return {
    text: `${(imp.deltaAbs * 100).toFixed(2)}%p`,
    down: proposed < current,
    better: imp.better,
  };
}

function krwBadge(
  currentText: string | null | undefined,
  proposed: number,
  direction: 'lower' | 'higher',
) {
  const current = parseCurrentValue(currentText, 'krw');
  const imp = improvement(current, proposed, direction);
  if (!imp || current === null) return null;
  return {
    text: formatKRW(imp.deltaAbs),
    down: proposed < current,
    better: imp.better,
  };
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
  infoTerm,
  labelNote,
  currentText,
  currentLabel = '현재 조건',
  proposedText,
  trailing,
  proposedFlash,
  proposedFlashTestId,
  proposedNumeric = true,
  emphasized = false,
}: {
  testId: string;
  label: string;
  /**
   * 용어집(`lib/glossary.ts`) 키 — 작성 화면과 같은 설명을 라벨 옆 ⓘ 로 보여준다.
   * 보증보험은 붙이지 않는다: 지금 용어집 설명이 보험료율·금액의 유불리를 말하는데,
   * 비교 화면은 보증보험을 중립 표기한다(product-rules — 기간·보험료율·유불리 추정 금지).
   */
  infoTerm?: string;
  /** 라벨 밑 한 줄 단서 — 이 지표가 왜 다른지. 개선폭 열을 오염시키지 않는 자리다. */
  labelNote?: string;
  currentText?: string | null;
  currentLabel?: string;
  proposedText: string;
  trailing?: ReactNode;
  proposedFlash?: boolean;
  proposedFlashTestId?: string;
  /** 제안값이 금액·요율이 아니라 상태어('없어요')면 false — mono/tabular 를 벗긴다. */
  proposedNumeric?: boolean;
  emphasized?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'col-span-full grid grid-cols-subgrid items-center py-4 @max-[620px]/summary:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @max-[620px]/summary:gap-x-3 @max-[620px]/summary:gap-y-2',
        emphasized && 'mb-1 rounded-[6px] bg-[var(--md-sys-color-surface-container-low)] px-4 @max-[620px]/summary:py-3',
      )}
    >
      <dt className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)] @max-[620px]/summary:col-span-2">
        {label}
        {infoTerm && <InfoTip term={infoTerm} className="ml-0.5" />}
        {labelNote && (
          <span className="mt-1 block text-[13px] font-normal text-[var(--md-sys-color-on-surface-variant)]">
            {labelNote}
          </span>
        )}
      </dt>
      {currentText ? (
        <dd className="min-w-0 text-[14px] text-right text-[var(--md-sys-color-on-surface-variant)] [overflow-wrap:anywhere] @max-[620px]/summary:text-left">
          <span className="mb-1 block text-[12px]">{currentLabel}</span>
          <span className="md-numeric">{currentText}</span>
        </dd>
      ) : (
        <dd aria-hidden="true" className="@max-[620px]/summary:hidden" />
      )}
      {currentText ? (
        <dd
          aria-hidden="true"
          data-testid="metric-arrow"
          className="text-center text-[var(--md-sys-color-on-surface-variant)] @max-[620px]/summary:hidden"
        >
          →
        </dd>
      ) : (
        <dd aria-hidden="true" className="@max-[620px]/summary:hidden" />
      )}
      <dd
        data-testid={proposedFlashTestId}
        className={cn(
          'min-w-0 font-semibold text-[var(--md-sys-color-on-surface)] [overflow-wrap:anywhere]',
          emphasized ? 'text-[26px] leading-tight' : 'text-[16px]',
          !currentText && '@max-[620px]/summary:col-span-2',
          proposedFlash && 'tier-flash',
        )}
      >
        <span className="mb-1 block text-[12px] font-normal leading-normal text-[var(--md-sys-color-on-surface-variant)]">
          받은 견적
        </span>
        <span className={cn(proposedNumeric && 'md-numeric')}>{proposedText}</span>
      </dd>
      <dd aria-hidden={!trailing || undefined} className="@max-[620px]/summary:col-span-2 @max-[620px]/summary:justify-self-end">{trailing}</dd>
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
