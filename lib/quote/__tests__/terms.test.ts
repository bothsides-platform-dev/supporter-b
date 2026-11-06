import { describe, expect, it } from 'vitest';
import {
  bidConditions,
  formatCondition,
  projectQuoteTerms,
  QuoteTermsSchema,
  validateSubmissionTerms,
  type QuoteTermsV2,
} from '../terms';
import { draftQuoteTerms } from '../draft-schema';
import { EMPTY_BID_DRAFT } from '../bid-draft';

const terms: QuoteTermsV2 = {
  _v: 2,
  signupFee: { state: 'negotiable' },
  guaranteeInsurance: { state: 'not_applicable' },
  fees: {
    'card:general': { state: 'confirmed', value: 0 },
    bank_transfer: { state: 'unset' },
    virtual_account: { state: 'confirmed', value: 300 },
  },
};
describe('versioned quote conditions', () => {
  it('keeps zero, unknown, negotiated and not-applicable distinct', () => {
    expect(formatCondition({ state: 'confirmed', value: 0 })).toBe('0원');
    expect(formatCondition({ state: 'unset' })).toBe('미입력');
    expect(formatCondition(terms.signupFee)).toBe('협의 필요');
    expect(formatCondition(terms.guaranteeInsurance)).toBe('해당 없음');
    expect(formatCondition(terms.fees.virtual_account, '원/건')).toBe('300원/건');
    expect(projectQuoteTerms(terms)).toEqual({
      signupFee: null,
      guaranteeInsurance: null,
      paymentFees: { card: { general: 0 }, virtual_account: 300 },
      customFees: {},
    });
  });
  it('rejects an amount on an unconfirmed condition and invalid fee units', () => {
    expect(
      QuoteTermsSchema.safeParse({
        ...terms,
        signupFee: { state: 'negotiable', value: 0 },
      }).success,
    ).toBe(false);
    expect(
      QuoteTermsSchema.safeParse({
        ...terms,
        fees: { bank_transfer: { state: 'confirmed', value: 300 } },
      }).success,
    ).toBe(false);
    expect(
      QuoteTermsSchema.safeParse({
        ...terms,
        fees: { virtual_account: { state: 'confirmed', value: 0.2 } },
      }).success,
    ).toBe(false);
  });
  it('requires explicit initial costs, one confirmed fee, and only requested keys', () => {
    expect(validateSubmissionTerms(terms, ['card', 'bank_transfer', 'virtual_account'], [])).toBe(
      true,
    );
    expect(validateSubmissionTerms({ ...terms, signupFee: { state: 'unset' } }, [], [])).toBe(
      false,
    );
    expect(
      validateSubmissionTerms({ ...terms, fees: { card: { state: 'negotiable' } } }, [], []),
    ).toBe(false);
    expect(validateSubmissionTerms(terms, ['card'], [])).toBe(false);
  });
  it('does not reinterpret historical zero or blank input', () => {
    expect(
      bidConditions({
        signupFee: 0,
        guaranteeInsurance: null,
        paymentFees: {},
        customFees: {},
      }).signupFee,
    ).toEqual({ state: 'confirmed', value: 0 });
    const blank = draftQuoteTerms(EMPTY_BID_DRAFT, ['bank_transfer'], []);
    expect(blank.signupFee).toEqual({ state: 'unset' });
    expect(blank.fees.bank_transfer).toEqual({ state: 'unset' });
    expect(
      QuoteTermsSchema.safeParse(
        draftQuoteTerms(
          { ...EMPTY_BID_DRAFT, conditionStates: { signupFee: 'confirmed' } },
          [],
          [],
        ),
      ).success,
    ).toBe(false);
  });
});
