import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import type { MerchantGrade } from '@/lib/types/biz-profile';

export const GENERAL_ASSUMED_RATE = 0.015;

export const SUPPORTER_B_RATE: Record<MerchantGrade, number> = {
  small: STATUTORY_CARD_FEE.small,
  sme1: STATUTORY_CARD_FEE.sme1,
  sme2: STATUTORY_CARD_FEE.sme2,
  sme3: STATUTORY_CARD_FEE.sme3,
  general: GENERAL_ASSUMED_RATE,
};

export function gradeFromVolume(annualKRW: number): MerchantGrade {
  if (annualKRW <= 3e8) return 'small';
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
