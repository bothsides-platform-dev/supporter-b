import { describe, it, expect, vi } from 'vitest';

// Mock server-action imports that BidWizard.tsx pulls in transitively
// (next-auth / next/server are incompatible with the jsdom environment).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/server/actions/bid', () => ({ submitBidAction: vi.fn() }));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: vi.fn(),
}));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
// BidContextStrip → RfpBriefPanel / CounterpartyProfileCard → chat actions → next-auth.
// Break the chain the same way BidWizard.test.tsx does.
vi.mock('../../RfpBriefPanel', () => ({ RfpBriefPanel: () => null }));
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: () => null,
}));

import { bidToDraft } from '../BidWizard';
import type { Bid } from '@/lib/types/bid';

// Minimal Bid factory — only the fields bidToDraft actually reads.
function makeBid(overrides: Partial<Bid> = {}): NonNullable<Parameters<typeof bidToDraft>[0]> {
  return {
    id: 'bid-1',
    rfpId: 'rfp-1',
    pgWsId: 'pg-ws-1',
    invitationId: 'inv-1',
    round: 1,
    settleCycle: 'D+1',
    settleLimit: 0,
    guaranteeInsurance: 0,
    paymentFees: {},
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'user-1',
    ...overrides,
  } satisfies Bid;
}

describe('bidToDraft', () => {
  describe('settleCycle → cycleUnit / cycleNum', () => {
    it('D+1 → cycleUnit="D", cycleNum="1"', () => {
      const draft = bidToDraft(makeBid({ settleCycle: 'D+1' }));
      expect(draft.cycleUnit).toBe('D');
      expect(draft.cycleNum).toBe('1');
    });

    it('M+2 → cycleUnit="M", cycleNum="2"', () => {
      const draft = bidToDraft(makeBid({ settleCycle: 'M+2' }));
      expect(draft.cycleUnit).toBe('M');
      expect(draft.cycleNum).toBe('2');
    });

    it('W+7 → cycleUnit="W", cycleNum="7"', () => {
      const draft = bidToDraft(makeBid({ settleCycle: 'W+7' }));
      expect(draft.cycleUnit).toBe('W');
      expect(draft.cycleNum).toBe('7');
    });

    it('bare "D" (no +n) → cycleUnit="D", cycleNum defaults to "1"', () => {
      // regex /^([A-Z]+)\+?(\d+)?$/ matches: m[1]="D", m[2]=undefined → '1' fallback
      const draft = bidToDraft(makeBid({ settleCycle: 'D' }));
      expect(draft.cycleUnit).toBe('D');
      expect(draft.cycleNum).toBe('1');
    });

    it('cycleNum > 99 는 99로 클램프된다: D+150 → cycleNum="99"', () => {
      const draft = bidToDraft(makeBid({ settleCycle: 'D+150' }));
      expect(draft.cycleNum).toBe('99');
    });

    it('cycleNum = 99 는 그대로 유지된다: D+99 → cycleNum="99"', () => {
      const draft = bidToDraft(makeBid({ settleCycle: 'D+99' }));
      expect(draft.cycleNum).toBe('99');
    });
  });

  describe('paymentFees → fees (정률 수단: decimal → percent string)', () => {
    it('number value converts decimal to percent string: 0.0125 → "1.25"', () => {
      // bank_transfer is a non-tiered 정률(%) method; value is plain decimal in Bid
      const draft = bidToDraft(makeBid({ paymentFees: { bank_transfer: 0.0125 } }));
      expect(draft.fees['bank_transfer']).toBe('1.25');
    });

    it('0.012 → "1.2"', () => {
      const draft = bidToDraft(makeBid({ paymentFees: { bank_transfer: 0.012 } }));
      expect(draft.fees['bank_transfer']).toBe('1.2');
    });

    it('3자리 이상 소수 수수료는 2자리로 반올림된다: 0.012345 → "1.23"', () => {
      const draft = bidToDraft(makeBid({ paymentFees: { bank_transfer: 0.012345 } }));
      expect(draft.fees['bank_transfer']).toBe('1.23');
    });

    it('customFees 도 2자리로 반올림된다: 0.005678 → "0.57"', () => {
      const draft = bidToDraft(makeBid({ customFees: { 'promo-fee': 0.005678 } }));
      expect(draft.fees['promo-fee']).toBe('0.57');
    });

    it('numeric value for a tiered method key is still mapped (value-type check, not method-category check)', () => {
      // bidToDraft checks `typeof v === 'number'` — it does NOT call isTieredMethod.
      // So a stored-number card fee is prefilled as a flat percent string.
      const draft = bidToDraft(makeBid({ paymentFees: { card: 0.015 } }));
      expect(draft.fees['card']).toBe('1.5');
    });

    it('TierRates object value is skipped — key absent from fees, no throw', () => {
      const draft = bidToDraft(
        makeBid({ paymentFees: { card: { general: 0.012, sole: 0.008 } } }),
      );
      expect(draft.fees).not.toHaveProperty('card');
    });

    it('multiple methods: 정률은 percent, 정액은 원 그대로, TierRates는 skip', () => {
      const draft = bidToDraft(
        makeBid({
          paymentFees: {
            virtual_account: 300, // 정액(건당) → 원 정수 문자열 그대로
            card: { general: 0.012 }, // skipped
            bank_transfer: 0.02, // 정률 → percent
          },
        }),
      );
      expect(draft.fees['virtual_account']).toBe('300');
      expect(draft.fees['bank_transfer']).toBe('2');
      expect(draft.fees).not.toHaveProperty('card');
    });
  });

  describe('paymentFees → fees (정액 수단: 원 정수 그대로)', () => {
    it('가상계좌는 fmtPct 변환 없이 원 정수 문자열로 prefill: 300 → "300"', () => {
      const draft = bidToDraft(makeBid({ paymentFees: { virtual_account: 300 } }));
      expect(draft.fees['virtual_account']).toBe('300');
    });
  });

  describe('customFees → fees', () => {
    it('custom fee decimal → percent string', () => {
      const draft = bidToDraft(makeBid({ customFees: { 'custom-abc': 0.005 } }));
      expect(draft.fees['custom-abc']).toBe('0.5');
    });
  });

  describe('settleLimit / guaranteeInsurance → string', () => {
    it('numeric values are stringified', () => {
      const draft = bidToDraft(makeBid({ settleLimit: 50000000, guaranteeInsurance: 12000000 }));
      expect(draft.settleLimit).toBe('50000000');
      expect(draft.guaranteeInsurance).toBe('12000000');
    });

    it('null-ish values default to "0"', () => {
      // makeBid sets both to 0 by default — confirm the zero path
      const draft = bidToDraft(makeBid({ settleLimit: 0, guaranteeInsurance: 0 }));
      expect(draft.settleLimit).toBe('0');
      expect(draft.guaranteeInsurance).toBe('0');
    });
  });

  describe('memo passthrough', () => {
    it('memo string is passed through as-is', () => {
      const draft = bidToDraft(makeBid({ memo: '협의 가능합니다' }));
      expect(draft.memo).toBe('협의 가능합니다');
    });

    it('undefined memo becomes empty string', () => {
      const draft = bidToDraft(makeBid({ memo: undefined }));
      expect(draft.memo).toBe('');
    });
  });

  describe('structural invariants', () => {
    it('__v is always 3', () => {
      const draft = bidToDraft(makeBid());
      expect(draft.__v).toBe(3);
    });

    it('fees is an object even when paymentFees and customFees are empty', () => {
      const draft = bidToDraft(makeBid({ paymentFees: {}, customFees: {} }));
      expect(typeof draft.fees).toBe('object');
      expect(Object.keys(draft.fees)).toHaveLength(0);
    });
  });
});
