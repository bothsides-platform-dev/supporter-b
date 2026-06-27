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

export function gradeFromVolume(annualKRW: number): MerchantTier {
  if (annualKRW <= 3e8) return 'sole';
  if (annualKRW <= 5e8) return 'sme1';
  if (annualKRW <= 1e9) return 'sme2';
  if (annualKRW <= 3e9) return 'sme3';
  return 'general';
}

export function annualMaxSavings(volume: number, currentRate: number): number {
  const after = SUPPORTER_B_RATE[gradeFromVolume(volume)];
  const diff = Math.max(0, currentRate - after);
  return Math.round(diff * volume);
}
