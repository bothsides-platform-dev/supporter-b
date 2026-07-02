import type { MerchantTier } from '@/lib/types/bid';

export const GENERAL_ASSUMED_RATE = 0.015;

// 절감 시뮬레이터용 등급별 달성 가능 카드 요율(추정 기준선). 마케팅 계산 전용으로
// 제품의 협상 입력값과는 무관하다.
export const SUPPORTER_B_RATE: Record<MerchantTier, number> = {
  sole: 0.005,
  sme1: 0.011,
  sme2: 0.0125,
  sme3: 0.015,
  general: GENERAL_ASSUMED_RATE,
};

// 등급 구간(연 거래액 상한, KRW). gradeFromVolume·tierRangeLabel의 단일 출처 —
// 여기 값을 바꾸면 등급 판정과 계산기 툴팁 표기가 함께 갱신된다.
const TIER_UPPER_BOUNDS: Array<{ tier: MerchantTier; maxKRW: number }> = [
  { tier: 'sole', maxKRW: 3e8 },
  { tier: 'sme1', maxKRW: 5e8 },
  { tier: 'sme2', maxKRW: 1e9 },
  { tier: 'sme3', maxKRW: 3e9 },
];

export function gradeFromVolume(annualKRW: number): MerchantTier {
  const found = TIER_UPPER_BOUNDS.find(({ maxKRW }) => annualKRW <= maxKRW);
  return found ? found.tier : 'general';
}

function eokLabel(krw: number): string {
  return `${Math.round(krw / 1e8).toLocaleString('ko-KR')}억`;
}

// 계산기 "가맹점 등급" 옆 툴팁에 쓰는, 사람이 읽는 구간 설명.
export function tierRangeLabel(tier: MerchantTier): string {
  const idx = TIER_UPPER_BOUNDS.findIndex((t) => t.tier === tier);
  if (idx === -1) {
    const prevMax = TIER_UPPER_BOUNDS[TIER_UPPER_BOUNDS.length - 1].maxKRW;
    return `연 거래액 ${eokLabel(prevMax)} 초과`;
  }
  const { maxKRW } = TIER_UPPER_BOUNDS[idx];
  const prevMax = idx > 0 ? TIER_UPPER_BOUNDS[idx - 1].maxKRW : 0;
  return prevMax === 0
    ? `연 거래액 ${eokLabel(maxKRW)} 이하`
    : `연 거래액 ${eokLabel(prevMax)} 초과 ${eokLabel(maxKRW)} 이하`;
}

// 현재 수수료율 슬라이더의 하한. 우리가 가정하는 달성 요율보다 항상 이 마진만큼 위에
// 두어, 어떤 거래액·요율 조합에서도 예상 절감액이 0원이 되지 않게 한다.
export const RATE_FLOOR_MARGIN = 0.001;

export function minCurrentRate(volume: number): number {
  return SUPPORTER_B_RATE[gradeFromVolume(volume)] + RATE_FLOOR_MARGIN;
}

export function annualMaxSavings(volume: number, currentRate: number): number {
  const after = SUPPORTER_B_RATE[gradeFromVolume(volume)];
  const diff = Math.max(0, currentRate - after);
  return Math.round(diff * volume);
}
