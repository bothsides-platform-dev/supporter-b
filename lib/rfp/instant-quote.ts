import { z } from 'zod';
import {
  AgreementRatesSchema,
  buildAgreementFees,
  type AgreementRate,
} from '@/lib/contract-doc/agreement';
import {
  MERCHANT_TIERS,
  PAYMENT_METHODS,
  isTieredMethod,
  type MerchantTier,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import { businessConfirmationSchema } from '@/lib/guest-rfp/business-confirmation';
import { currentPgsSchema } from './current-pgs';
import {
  MAXIMUM_PRICE_VALUES,
  SALES_METHOD_VALUES,
  productInfoSchema,
} from './product-info';
import { VOLUME_BANDS, VOLUME_LABELS } from './assignment';

export const instantConsentVersion = '2026-11-22.1';
export const commitment =
  '실제 PG 이용 시작일부터 2년간 선택한 PG를 독점 이용하고, 약정 위반 시 실제 할인받은 수수료를 반환해요.';
export const sharing = (pg: string) =>
  pg +
  '에 상호, 사업자등록번호, 홈페이지·상품, 요청 작성자의 이름·이메일·전화번호, 거래액과 심사 답변을 제공하는 데 동의해요.';
const won = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const amount = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), won }).strict(),
  z.object({ kind: z.literal('negotiable') }).strict(),
  z.object({ kind: z.literal('none') }).strict(),
]);
const cycle = z
  .object({
    days: z.number().int().nonnegative().max(365),
    unit: z.enum(['business', 'calendar']),
  })
  .strict();
const conditions = z
  .object({ insurance: amount, limit: amount, cycle, signupFee: amount })
  .strict();
export const screeningSchema = productInfoSchema
  .extend({ deliveryDays: z.number().int().nonnegative().max(3650) })
  .strict();
export type Screening = z.infer<typeof screeningSchema>;
export const inputSchema = z
  .object({
    business: businessConfirmationSchema,
    groupId: z.uuid().nullable(),
    customIndustry: z.string().trim().max(100).default(''),
    products: z.string().trim().min(1).max(200),
    contractType: z.enum(['new', 'renewal']),
    expectedVolume: z.enum(VOLUME_BANDS).optional(),
    monthlyAvgPgVolume: z
      .string()
      .regex(/^\d{1,15}$/)
      .optional(),
    methods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1)
      .max(PAYMENT_METHODS.length)
      .refine((v) => new Set(v).size === v.length),
    currentPgs: currentPgsSchema,
    annualRevenue: won.optional(),
    current: conditions
      .pick({ insurance: true, limit: true, cycle: true })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine((i) => !!i.groupId || !!i.customIndustry, '업종을 선택해주세요.')
  .refine(
    (i) =>
      i.contractType === 'new'
        ? !!i.expectedVolume &&
          !i.monthlyAvgPgVolume &&
          !i.current &&
          i.currentPgs.length === 0
        : !!i.monthlyAvgPgVolume &&
          i.currentPgs.length > 0 &&
          !i.expectedVolume,
    '거래액과 현재 PG를 확인해주세요.',
  );
export type InstantInput = z.infer<typeof inputSchema>;
export function instantVolumeEligible(
  i: Pick<
    Partial<InstantInput>,
    'contractType' | 'monthlyAvgPgVolume' | 'expectedVolume'
  >,
) {
  if (i.contractType === 'new')
    return ['under10m', '10m', '30m'].includes(i.expectedVolume ?? '');
  return (
    i.contractType === 'renewal' &&
    /^\d{1,15}$/.test(i.monthlyAvgPgVolume ?? '') &&
    Number(i.monthlyAvgPgVolume) < 50_000_000
  );
}
export const instantPolicySchema = z
  .object({
    fees: AgreementRatesSchema,
    terms: conditions,
    direct: conditions
      .pick({ insurance: true, limit: true, cycle: true })
      .partial()
      .strict(),
    review: z
      .object({
        cashConvertible: z.boolean(),
        prices: z.array(z.enum(MAXIMUM_PRICE_VALUES)),
        sales: z.array(z.enum(SALES_METHOD_VALUES)),
        maxDeliveryDays: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    validityDays: z.number().int().min(1).max(365),
    retryDays: z.number().int().min(1).max(365),
    responseDays: z.number().int().min(2).max(730),
    ackDays: z.number().int().min(1).max(365),
    applicationDays: z.number().int().min(1).max(365),
    resultDays: z.number().int().min(1).max(365),
  })
  .strict()
  .refine(
    (p) =>
      p.responseDays > Math.max(p.ackDays, p.applicationDays, p.resultDays),
    '회신 링크는 후속 안내 기한 이후까지 유효해야 해요.',
  );
export type InstantPolicy = z.infer<typeof instantPolicySchema>;
export const screeningKeys = [
  'cashConvertible',
  'maximumPrice',
  'salesMethods',
  'deliveryDays',
] as const;
export type ScreenKey = (typeof screeningKeys)[number];
export function reviewQuestions(review: InstantPolicy['review']): ScreenKey[] {
  return screeningKeys.filter(
    (k) =>
      ({
        cashConvertible: review.cashConvertible,
        maximumPrice: !!review.prices.length,
        salesMethods: !!review.sales.length,
        deliveryDays: review.maxDeliveryDays !== null,
      })[k],
  );
}
export function needsReview(
  review: InstantPolicy['review'],
  s: Partial<Screening>,
) {
  return (
    (review.cashConvertible && s.cashConvertible === true) ||
    (!!s.maximumPrice && review.prices.includes(s.maximumPrice)) ||
    s.salesMethods?.some((m) => review.sales.includes(m)) ||
    (review.maxDeliveryDays !== null &&
      (s.deliveryDays ?? 0) > review.maxDeliveryDays)
  );
}
export type FixedTerms = {
  industry?: string;
  pgName: string;
  pgId: string;
  policyVersion: number;
  rateVersion: number;
  policy: InstantPolicy;
  standards: AgreementRate[];
  fees: Partial<Record<PaymentMethod, number | TierRates>>;
};
export function assembleTerms(
  pgId: string,
  pgName: string,
  policyVersion: number,
  raw: unknown,
  rateVersion: number,
  rates: unknown,
  industry?: string,
): FixedTerms | undefined {
  const policy = instantPolicySchema.safeParse(raw),
    standard = AgreementRatesSchema.safeParse(rates);
  if (!policy.success || !standard.success) return;
  const prices = new Map(policy.data.fees.map((r) => [r.key, r.rate]));
  const fees: FixedTerms['fees'] = {};
  for (const method of PAYMENT_METHODS) {
    if (isTieredMethod(method)) {
      const rows = MERCHANT_TIERS.map((t) => prices.get(method + ':' + t));
      if (
        prices.has(method) ||
        (rows.some((n) => n !== undefined) && rows.some((n) => n === undefined))
      )
        return;
      if (rows[0] !== undefined)
        fees[method] = Object.fromEntries(
          MERCHANT_TIERS.map((t, i) => [t, rows[i]]),
        );
    } else if (prices.has(method)) fees[method] = prices.get(method)!;
  }
  if (!fees.card || policy.data.fees.some((f) => f.key.startsWith('custom:')))
    return;
  if (
    !buildAgreementFees(
      { paymentFees: fees, customFees: {}, customMethods: [] },
      standard.data,
    ).ok
  )
    return;
  return {
    pgId,
    pgName,
    industry,
    policyVersion,
    rateVersion,
    policy: policy.data,
    standards: standard.data.filter((row) => prices.has(row.key)),
    fees,
  };
}
export type DisplayTerms = Omit<FixedTerms, 'policy'> & {
  policy: Pick<InstantPolicy, 'terms' | 'direct' | 'validityDays'>;
};
export function feeRows(t: DisplayTerms, tier?: MerchantTier | null) {
  const fees = Object.fromEntries(
    PAYMENT_METHODS.filter((m) => t.fees[m] !== undefined).map((m) => {
      const fee = t.fees[m]!;
      return [
        m,
        typeof fee === 'number' || !tier ? fee : { [tier]: fee[tier] },
      ];
    }),
  );
  const result = buildAgreementFees(
    { paymentFees: fees, customMethods: [], customFees: {} },
    t.standards,
  );
  if (!result.ok) throw Error(result.error);
  return result.rows;
}
export const volumeText = (i: InstantInput) =>
  i.contractType === 'new'
    ? '구매사가 적은 예상 월 PG 거래액 ' + VOLUME_LABELS[i.expectedVolume!]
    : '전년도 월평균 PG 거래액 ' +
      Number(i.monthlyAvgPgVolume).toLocaleString('ko-KR') +
      '원';
const money = (v: number) => v.toLocaleString('ko-KR') + '원';
function amountLabel(value: z.infer<typeof amount>, empty: string) {
  return value.kind === 'none'
    ? empty
    : value.kind === 'negotiable'
      ? '협의 필요'
      : money(value.won);
}
export function conditionLines(t: DisplayTerms, i: InstantInput) {
  const base = i.contractType === 'new' ? t.policy.direct : i.current;
  const label = i.contractType === 'new' ? '직접 가입' : '현재';
  const c = t.policy.terms;
  const cycleLabel = (v: typeof c.cycle) =>
    'D+' + v.days + ' (' + (v.unit === 'business' ? '영업일' : '달력일') + ')';
  const rows = [
    ['보증보험 가입금액', amountLabel(c.insurance, '가입 면제')],
    ['정산한도', amountLabel(c.limit, '해당 없음')],
    ['정산주기', cycleLabel(c.cycle)],
    ['가입비', amountLabel(c.signupFee, '해당 없음')],
  ];
  if (base?.insurance) {
    rows[0][1] +=
      ' · ' + label + ' ' + amountLabel(base.insurance, '가입 면제');
    if (base.insurance.kind === 'fixed' && c.insurance.kind !== 'negotiable') {
      const diff =
        base.insurance.won -
        (c.insurance.kind === 'none' ? 0 : c.insurance.won);
      if (diff > 0) rows[0][1] += ' · 가입금액 ' + money(diff) + ' 감소';
    }
  }
  if (base?.limit)
    rows[1][1] += ' · ' + label + ' ' + amountLabel(base.limit, '해당 없음');
  if (base?.cycle) {
    rows[2][1] += ' · ' + label + ' ' + cycleLabel(base.cycle);
    if (base.cycle.unit === c.cycle.unit && base.cycle.days > c.cycle.days)
      rows[2][1] +=
        ' · ' +
        (base.cycle.days - c.cycle.days) +
        (c.cycle.unit === 'business' ? '영업일' : '일') +
        ' 빠름';
  }
  return rows;
}
export function estimatedSaving(
  i: InstantInput,
  t: DisplayTerms,
  tier: MerchantTier,
) {
  if (i.methods.length !== 1 || i.methods[0] === 'virtual_account') return;
  const method = i.methods[0],
    fee = t.fees[method];
  const final = typeof fee === 'number' ? fee : fee?.[tier];
  const standard = t.standards.find(
    (r) => r.key === (isTieredMethod(method) ? method + ':' + tier : method),
  )?.rate;
  if (final === undefined || standard === undefined || standard <= final)
    return;
  const saving = (volume: number) =>
    money(Math.round(volume * (standard - final)));
  if (i.contractType === 'renewal')
    return '월 ' + saving(Number(i.monthlyAvgPgVolume)) + ' 절감 예상';
  const bounds = { under10m: [0, 1e7], '10m': [1e7, 3e7], '30m': [3e7, 5e7] }[
    i.expectedVolume as 'under10m' | '10m' | '30m'
  ];
  if (bounds)
    return (
      '월 ' +
      saving(bounds[0]) +
      ' 이상 ' +
      saving(bounds[1]) +
      ' 미만 절감 예상'
    );
}
export type Offer = {
  terms: DisplayTerms;
  tier: MerchantTier | null;
  stamp: string;
  expires: number;
};
export type Offers = { risk: string; offers: Offer[]; questions: ScreenKey[] };
