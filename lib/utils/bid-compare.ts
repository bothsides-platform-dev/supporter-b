// 구매사 견적 비교 순수 함수 — 현재조건 파싱·지표 랭킹·개선폭 계산.
// 표현(컴포넌트)과 분리해 단위 테스트 가능하게 둔다. 정산주기는 settle-cycle 재사용.
import type { Bid } from '@/lib/types/bid';
import { compareSettleCycle } from './settle-cycle';

export type MetricDirection = 'lower' | 'higher';

const CYCLE_RE = /^[DWM]\+\d+$/;

/**
 * 구매사 "현재 조건" 자유 텍스트에서 best-effort 숫자 추출.
 * - 'percent': "2.8%"·"2.80 %"·"2.8" → 소수 요율(0.028). (paymentFees 스케일과 일치)
 * - 'krw': "5억"·"7000만"·"120만원"·"1,200,000원" → 원 단위 정수.
 * 추출 실패(자유 텍스트)면 null.
 */
export function parseCurrentValue(
  text: string | null | undefined,
  unit: 'percent' | 'krw',
): number | null {
  if (!text) return null;
  const trimmed = text.trim();

  if (unit === 'percent') {
    const m = trimmed.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    return parseFloat(m[0]) / 100;
  }

  // krw — 억/만 단위 우선, 없으면 콤마 제거 후 평문 숫자.
  const eok = trimmed.match(/(\d+(?:\.\d+)?)\s*억/);
  if (eok) return Math.round(parseFloat(eok[1]) * 100_000_000);
  const man = trimmed.match(/(\d+(?:\.\d+)?)\s*만/);
  if (man) return Math.round(parseFloat(man[1]) * 10_000);
  const plain = trimmed.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!plain) return null;
  return Math.round(parseFloat(plain[0]));
}

export type RankedBid = { bid: Bid; value: number | null; isBest: boolean };

/**
 * 수치 지표로 전 PG 줄세움(best-first). 값이 없는(null) 견적은 맨 뒤로 보내고
 * best 로 표시하지 않는다. best = 최선값과 동일한 값(동률 허용).
 */
export function rankByMetric(
  bids: Bid[],
  getValue: (bid: Bid) => number | null,
  direction: MetricDirection,
): RankedBid[] {
  const entries = bids.map((bid) => ({ bid, value: getValue(bid) }));
  entries.sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return direction === 'lower' ? a.value - b.value : b.value - a.value;
  });
  const bestValue = entries.find((e) => e.value !== null)?.value ?? null;
  return entries.map((e) => ({
    bid: e.bid,
    value: e.value,
    isBest: e.value !== null && e.value === bestValue,
  }));
}

/** 정산주기로 줄세움 — 빠른(작은) 순. best = 최선 주기와 동일. */
export function rankByCycle(bids: Bid[]): { bid: Bid; isBest: boolean }[] {
  const sorted = [...bids].sort((a, b) => compareSettleCycle(a.settleCycle, b.settleCycle));
  const bestCycle = sorted[0]?.settleCycle;
  return sorted.map((bid) => ({
    bid,
    isBest: bestCycle !== undefined && compareSettleCycle(bid.settleCycle, bestCycle) === 0,
  }));
}

/**
 * 현재값 대비 제안값 개선폭. 현재값이 파싱 불가(null)면 null(배지 생략·병기만).
 * better = 방향성 기준 제안값이 현재보다 나은지.
 */
export function improvement(
  current: number | null,
  proposed: number,
  direction: MetricDirection,
): { deltaAbs: number; better: boolean } | null {
  if (current === null) return null;
  const better = direction === 'lower' ? proposed < current : proposed > current;
  return { deltaAbs: Math.abs(proposed - current), better };
}

/**
 * 현재값 대비 제안값의 정성 판정 — better/worse/same. 현재값이 null이면 비교 불가(null).
 * 헤더 요약("좋아져요" vs 중립)에 쓰며, '같음'을 '나쁨'과 구분한다.
 */
export function metricVerdict(
  current: number | null,
  proposed: number,
  direction: MetricDirection,
): 'better' | 'worse' | 'same' | null {
  if (current === null) return null;
  if (proposed === current) return 'same';
  const better = direction === 'lower' ? proposed < current : proposed > current;
  return better ? 'better' : 'worse';
}

/**
 * 정산주기 정성 비교 — 현재 대비 제안이 더 빠름/같음/더 느림.
 * 현재가 없거나 유효 주기 문자열이 아니면 null(개선폭 표기 안 함).
 */
export function cycleQuality(
  current: string | null | undefined,
  proposed: string,
): 'faster' | 'same' | 'slower' | null {
  if (!current || !CYCLE_RE.test(current.trim())) return null;
  const cmp = compareSettleCycle(proposed, current);
  if (cmp < 0) return 'faster';
  if (cmp > 0) return 'slower';
  return 'same';
}
