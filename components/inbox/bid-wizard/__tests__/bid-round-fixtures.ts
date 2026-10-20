import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';

export const historyRfp = {
  code: 'P-TEST', title: '견적', deadline: '2026-10-25T09:00:00Z',
  customPaymentMethods: [{ id: 'custom-a', label: '직접 결제' }, { id: 'custom-b', label: '직접 결제' }],
} as RFP;

export function roundBid(round: number, overrides: Partial<Bid> = {}): Bid {
  return {
    id: `bid-${round}`, round, rfpId: 'rfp-1', pgWsId: 'pg-1', invitationId: 'inv-1',
    status: 'submitted', submittedBy: `author-${round}`, submittedAt: `2026-10-${14 + round}T05:20:00Z`,
    settleCycle: 'D+2', settleLimit: 8000000, guaranteeInsurance: 0, signupFee: 150000,
    paymentFees: { card: { sole: 0.012, sme1: 0.022 } }, customFees: {}, proposalPdfs: [],
    ...overrides,
  };
}
