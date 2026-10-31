import { z } from 'zod';
import {
  isFlatFeeMethod,
  isTieredMethod,
  MERCHANT_TIERS,
  PAYMENT_METHODS,
  type Bid,
  type PaymentMethod,
} from '@/lib/types/bid';

export const CONDITION_STATES = ['unset', 'confirmed', 'negotiable', 'not_applicable'] as const;
export const ConditionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unset') }).strict(),
  z
    .object({
      state: z.literal('confirmed'),
      value: z.number().finite().nonnegative().max(999_999_999_999),
    })
    .strict(),
  z.object({ state: z.literal('negotiable') }).strict(),
  z.object({ state: z.literal('not_applicable') }).strict(),
]);
export type QuoteCondition = z.infer<typeof ConditionSchema>;
export type ConditionState = QuoteCondition['state'];
export const QuoteTermsSchema = z
  .object({
    _v: z.literal(2),
    signupFee: ConditionSchema,
    guaranteeInsurance: ConditionSchema,
    // A tier is a separate condition: card:sole, card:general, etc. Custom keys are UUIDs.
    fees: z
      .record(z.string().min(1).max(100), ConditionSchema)
      .refine((v) => Object.keys(v).length <= 100),
  })
  .strict()
  .superRefine((terms, ctx) => {
    for (const [key, term] of Object.entries(terms.fees)) {
      if (term.state !== 'confirmed') continue;
      if (isFlatFeeMethod(key as PaymentMethod) ? !Number.isInteger(term.value) : term.value > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['fees', key],
          message: '수수료 단위를 확인해요',
        });
      }
    }
  });
export type QuoteTermsV2 = z.infer<typeof QuoteTermsSchema>;
export type QuoteTerms = { _v: 1 } | QuoteTermsV2;
export const unsetCondition = (): QuoteCondition => ({ state: 'unset' });
export const confirmedValue = (term: QuoteCondition): number | null =>
  term.state === 'confirmed' ? term.value : null;

export function feeConditionKeys(methods: PaymentMethod[], customIds: string[] = []): string[] {
  return [
    ...methods.flatMap((m) => (isTieredMethod(m) ? MERCHANT_TIERS.map((t) => `${m}:${t}`) : [m])),
    ...customIds,
  ];
}

/** Legacy zero remains a recorded number. It is never backfilled as free/not-applicable. */
export function bidConditions(
  bid: Pick<Bid, 'quoteTerms' | 'signupFee' | 'guaranteeInsurance' | 'paymentFees' | 'customFees'>,
): QuoteTermsV2 {
  if (bid.quoteTerms?._v === 2) return bid.quoteTerms;
  const condition = (value: number | null | undefined): QuoteCondition =>
    value == null ? unsetCondition() : { state: 'confirmed', value };
  const fees: QuoteTermsV2['fees'] = {};
  for (const [method, rates] of Object.entries(bid.paymentFees ?? {})) {
    if (typeof rates === 'number') {
      if (isTieredMethod(method as PaymentMethod))
        for (const tier of MERCHANT_TIERS) fees[`${method}:${tier}`] = condition(rates);
      else fees[method] = condition(rates);
    } else if (rates)
      for (const [tier, rate] of Object.entries(rates)) fees[`${method}:${tier}`] = condition(rate);
  }
  for (const [key, value] of Object.entries(bid.customFees ?? {})) fees[key] = condition(value);
  return {
    _v: 2,
    signupFee: condition(bid.signupFee),
    guaranteeInsurance: condition(bid.guaranteeInsurance),
    fees,
  };
}

/** Only confirmed amounts reach legacy numeric consumers, including agreement generation. */
export function projectQuoteTerms(terms: QuoteTermsV2) {
  const paymentFees: Bid['paymentFees'] = {};
  const customFees: Bid['customFees'] = {};
  for (const [key, term] of Object.entries(terms.fees)) {
    if (term.state !== 'confirmed') continue;
    const [method, tier] = key.split(':');
    if ((PAYMENT_METHODS as readonly string[]).includes(method)) {
      const m = method as PaymentMethod;
      if (tier)
        paymentFees[m] = {
          ...(typeof paymentFees[m] === 'object' ? paymentFees[m] : {}),
          [tier]: term.value,
        };
      else paymentFees[m] = term.value;
    } else customFees[key] = term.value;
  }
  return {
    signupFee: confirmedValue(terms.signupFee),
    guaranteeInsurance: confirmedValue(terms.guaranteeInsurance),
    paymentFees,
    customFees,
  };
}

export function formatCondition(
  term: QuoteCondition | undefined,
  unit: '원' | '원/건' | '%' = '원',
): string {
  if (!term || term.state === 'unset') return '미입력';
  if (term.state === 'negotiable') return '협의 필요';
  if (term.state === 'not_applicable') return '해당 없음';
  if (!Number.isFinite(term.value)) return '금액 확인 필요';
  const value = unit === '%' ? Number((term.value * 100).toPrecision(15)) : term.value;
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 6 })}${unit}`;
}

export function validateSubmissionTerms(
  terms: QuoteTermsV2,
  methods: PaymentMethod[],
  customIds: string[],
): boolean {
  const allowed = new Set(
    feeConditionKeys(methods.length ? methods : [...PAYMENT_METHODS], customIds),
  );
  return (
    terms.signupFee.state !== 'unset' &&
    terms.guaranteeInsurance.state !== 'unset' &&
    Object.keys(terms.fees).every((key) => allowed.has(key)) &&
    Object.values(terms.fees).some((term) => term.state === 'confirmed')
  );
}
