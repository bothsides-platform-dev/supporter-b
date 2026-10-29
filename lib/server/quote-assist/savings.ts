import type { MerchantTier } from '@/lib/types/bid';

export type SavingsInput = {
  contractType: 'new' | 'renewal';
  annualRevenue?: number;
  annualCardVolume?: number;
  currentFeePercent?: number;
  currentFeeVat?: 'included' | 'excluded';
};
export type SavingsRate = {
  pgId: string; pgName: string; proposedPercent: number | null; feeNote: string;
  standardFraction?: number | null;
};
export function provisionalTier(revenue: number): MerchantTier {
  return revenue <= 300000000 ? 'sole' : revenue <= 500000000 ? 'sme1'
    : revenue <= 1000000000 ? 'sme2' : revenue <= 3000000000 ? 'sme3' : 'general';
}
export function calculateQuoteSavings(input: SavingsInput, rate: SavingsRate) {
  const valid = (value: unknown, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  if (!valid(input.annualRevenue, Number.MAX_SAFE_INTEGER) || !valid(input.annualCardVolume, Number.MAX_SAFE_INTEGER))
    return { status: 'unavailable' as const, reason: 'inputs' as const };
  if (!valid(rate.proposedPercent, 100) || !rate.feeNote.trim())
    return { status: 'unavailable' as const, reason: 'rates' as const };
  if (input.contractType === 'new' ? !valid(rate.standardFraction, 1)
    : !valid(input.currentFeePercent, 100) || !input.currentFeeVat)
    return { status: 'unavailable' as const, reason: input.contractType === 'new' ? 'rates' as const : 'inputs' as const };
  const baselinePercent = Number((input.contractType === 'new' ? rate.standardFraction! * 100
    : input.currentFeePercent! / (input.currentFeeVat === 'included' ? 1.1 : 1)).toFixed(12));
  const difference = Number((baselinePercent - rate.proposedPercent).toFixed(12));
  const exactAnnual = input.annualCardVolume * difference / 100;
  return { status: difference > 0 && Math.round(exactAnnual) > 0 ? 'calculated' as const : 'no_saving' as const,
    annual: Math.round(exactAnnual), monthly: Math.round(exactAnnual / 12),
    provisionalTier: provisionalTier(input.annualRevenue), revenueIsEstimate: input.contractType === 'new',
    annualCardVolume: input.annualCardVolume, baselinePercent, proposedPercent: rate.proposedPercent,
    vat: 'excluded' as const, pgId: rate.pgId, pgName: rate.pgName, feeNote: rate.feeNote };
}
export type SavingsResult = ReturnType<typeof calculateQuoteSavings>;
