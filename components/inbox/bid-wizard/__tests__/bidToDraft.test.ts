// Mock server-action imports that BidWizard.tsx pulls in transitively
// (next-auth / next/server are incompatible with the jsdom environment).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/server/actions/bid', () => ({ submitBidAction: vi.fn() }));
vi.mock('@/lib/server/actions/onboarding/simulateSampleAwardAction', () => ({
  simulateSampleAwardAction: vi.fn(),
}));
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
  });

  describe('paymentFees → fees (decimal → percent string)', () => {
    it('number value converts decimal to percent string: 0.0125 → "1.25"', () => {
      // virtual_account is non-tiered; value is plain number in Bid
      const draft = bidToDraft(makeBid({ paymentFees: { virtual_account: 0.0125 } }));
      expect(draft.fees['virtual_account']).toBe('1.25');
    });

    it('0.012 → "1.2"', () => {
      const draft = bidToDraft(makeBid({ paymentFees: { bank_transfer: 0.012 } }));
      expect(draft.fees['bank_transfer']).toBe('1.2');
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

    it('multiple methods: number values mapped, TierRates silently skipped', () => {
      const draft = bidToDraft(
        makeBid({
          paymentFees: {
            virtual_account: 0.01,
            card: { general: 0.012 }, // skipped
            bank_transfer: 0.02,
          },
        }),
      );
      expect(draft.fees['virtual_account']).toBe('1');
      expect(draft.fees['bank_transfer']).toBe('2');
      expect(draft.fees).not.toHaveProperty('card');
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
