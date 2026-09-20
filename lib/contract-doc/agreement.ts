import { z } from 'zod';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isFlatFeeMethod,
  isTieredMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { ContractDoc } from '@/lib/types/contract-doc';
import type { FeeTableInput, FeeTableRow } from './fee-table';

export const AGREEMENT_VERSION = '2026-09-20-v1';
export const AGREEMENT_TITLE = '전자결제서비스 장기계약 부속합의서';
const party = z
  .object({
    company: z.string().trim().min(1).max(100),
    bizNo: z
      .string()
      .transform((v) => v.replace(/-/g, ''))
      .pipe(z.string().regex(/^\d{10}$/)),
    address: z.string().trim().min(1).max(200),
    representative: z.string().trim().min(1).max(50),
  })
  .strict();
export const AgreementPartiesSchema = z.object({ buyer: party, pg: party }).strict();
export type AgreementParties = z.infer<typeof AgreementPartiesSchema>;
// Drafts allow incomplete fields but never free-form clauses or fee overrides.
const draftParty = z
  .object({
    company: z.string().max(100),
    bizNo: z.string().max(12),
    address: z.string().max(200),
    representative: z.string().max(50),
  })
  .strict();
export const AgreementDraftSchema = z.object({ buyer: draftParty, pg: draftParty }).strict();

export const AGREEMENT_RATE_OPTIONS = PAYMENT_METHODS.flatMap((method) =>
  isTieredMethod(method)
    ? [
        {
          key: method,
          label: `${PAYMENT_METHOD_LABELS[method]} · 단일요율`,
          flat: false,
        },
        ...MERCHANT_TIERS.map((tier) => ({
          key: `${method}:${tier}`,
          label: `${PAYMENT_METHOD_LABELS[method]} · ${MERCHANT_TIER_LABELS[tier]}`,
          flat: false,
        })),
      ]
    : [
        {
          key: method,
          label: PAYMENT_METHOD_LABELS[method],
          flat: isFlatFeeMethod(method),
        },
      ],
);
const rateKeys = new Set(AGREEMENT_RATE_OPTIONS.map((o) => o.key));
export const AgreementRatesSchema = z
  .array(
    z
      .object({
        key: z.string().min(1).max(140),
        rate: z.number().finite().nonnegative(),
      })
      .strict(),
  )
  .max(100)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const flat = row.key === 'virtual_account';
      if (
        (!rateKeys.has(row.key) && !/^custom:.{1,100}$/.test(row.key)) ||
        seen.has(row.key) ||
        (flat ? !Number.isInteger(row.rate) || row.rate > 1000000 : row.rate > 1)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: '수수료 기준을 확인해 주세요',
        });
      }
      seen.add(row.key);
    });
  });
export type AgreementRate = z.infer<typeof AgreementRatesSchema>[number];
export type AgreementFeeRow = FeeTableRow & {
  standard: string;
  discount: string;
};

// Subtract the stored decimal values, not binary floats. A signed document must
// preserve finer quote precision without printing floating-point subtraction noise.
function percentageColumns(standard: number, final: number) {
  const parts = (value: number) => {
    const [mantissa, exponent = '0'] = String(value).split('e');
    return {
      digits: BigInt(mantissa.replace('.', '')),
      scale: (mantissa.split('.')[1]?.length ?? 0) - Number(exponent),
    };
  };
  const a = parts(standard),
    b = parts(final);
  const scale = Math.max(2, a.scale, b.scale);
  const standardDigits = a.digits * BigInt(10) ** BigInt(scale - a.scale);
  const finalDigits = b.digits * BigInt(10) ** BigInt(scale - b.scale);
  const format = (digits: bigint) => {
    const fractionLength = scale - 2;
    const text = digits.toString().padStart(fractionLength + 1, '0');
    const integer = fractionLength ? text.slice(0, -fractionLength) : text;
    const fraction = (fractionLength ? text.slice(-fractionLength) : '')
      .replace(/0+$/, '')
      .padEnd(2, '0');
    return `${integer}.${fraction}%`;
  };
  return {
    standard: format(standardDigits),
    discount: `${format(standardDigits - finalDigits)}p`,
    value: format(finalDigits),
  };
}

export function buildAgreementFees(
  input: FeeTableInput,
  rates: AgreementRate[],
): { ok: true; rows: AgreementFeeRow[] } | { ok: false; error: string } {
  if (!AgreementRatesSchema.safeParse(rates).success)
    return { ok: false, error: 'AGREEMENT_RATES_MISSING' };
  const standards = new Map(rates.map((r) => [r.key, r.rate]));
  const rows: AgreementFeeRow[] = [];
  const add = (key: string, label: string, final: number, flat = false): string | undefined => {
    const standard = standards.get(key);
    if (standard === undefined) return 'AGREEMENT_RATES_MISSING';
    if (!Number.isFinite(final) || final < 0 || (flat ? !Number.isInteger(final) : final > 1))
      return 'AGREEMENT_FEES_INVALID';
    if (standard < final) return 'AGREEMENT_RATE_BELOW_QUOTE';
    const format = (v: number) => `${v.toLocaleString('ko-KR')}원/건`;
    rows.push({
      label,
      ...(flat
        ? {
            standard: format(standard),
            discount: format(standard - final),
            value: format(final),
          }
        : percentageColumns(standard, final)),
    });
  };
  for (const [method, fee] of Object.entries(input.paymentFees)) {
    if (!(PAYMENT_METHODS as readonly string[]).includes(method))
      return { ok: false, error: 'AGREEMENT_FEES_INVALID' };
    const m = method as PaymentMethod;
    if (typeof fee === 'number') {
      const error = add(m, PAYMENT_METHOD_LABELS[m], fee, isFlatFeeMethod(m));
      if (error) return { ok: false, error };
    } else {
      if (
        !fee ||
        !isTieredMethod(m) ||
        Object.keys(fee).some((k) => !(MERCHANT_TIERS as readonly string[]).includes(k))
      )
        return { ok: false, error: 'AGREEMENT_FEES_INVALID' };
      for (const tier of MERCHANT_TIERS) {
        if (fee[tier] === undefined) continue;
        const error = add(
          `${m}:${tier}`,
          `${PAYMENT_METHOD_LABELS[m]} · ${MERCHANT_TIER_LABELS[tier]}`,
          fee[tier],
        );
        if (error) return { ok: false, error };
      }
    }
  }
  for (const [id, fee] of Object.entries(input.customFees)) {
    const label = input.customMethods.find((m) => m.id === id)?.label;
    if (!label) return { ok: false, error: 'AGREEMENT_FEES_INVALID' };
    const error = add(`custom:${label}`, label, fee);
    if (error) return { ok: false, error };
  }
  return rows.length ? { ok: true, rows } : { ok: false, error: 'AGREEMENT_FEES_EMPTY' };
}

export function buildAgreementDocument(buyer: string, pg: string): ContractDoc {
  return {
    _v: 1,
    title: AGREEMENT_TITLE,
    preamble: `${buyer}(이하 “구매사”)와 ${pg}(이하 “PG사”)는 양 당사자가 체결하였거나 체결할 전자결제서비스 이용계약(이하 “원 계약”)에 부수하여 다음과 같이 합의한다.`,
    clauses: [
      {
        id: 'purpose',
        kind: 'text',
        heading: '목적',
        body: '본 합의서는 구매사의 전자결제서비스 장기이용에 따른 수수료 할인과 관련한 권리·의무 및 기타 사항을 정함을 목적으로 한다.',
      },
      {
        id: 'discount',
        kind: 'text',
        heading: '수수료 할인',
        body: '① 구매사가 약정기간 동안 PG사가 제공하는 전자결제서비스만을 이용하는 조건으로 수수료 할인을 제공한다. 다만 PG사의 시스템 장애로 2시간 이상 서비스를 이용할 수 없어 정상화까지 다른 서비스를 이용하는 경우, PG사의 귀책사유로 계약을 해지하는 경우 또는 양 당사자가 사전에 합의한 경우에는 독점 이용 조건 위반으로 보지 않는다.\n② 최종 적용 수수료는 별첨 표와 같다. 구체적인 정산방식은 원 계약을 따르며 할인 적용에 오류가 있으면 상대방에게 통보하고 다음 정산에 반영한다.',
      },
      {
        id: 'term',
        kind: 'text',
        heading: '약정기간',
        body: '약정기간은 원 계약의 효력 발생일과 본 합의서의 양측 서명 완료일 중 늦은 날부터 2년으로 한다. 원 계약이 종료되면 본 합의서도 함께 종료된다. 본 합의서의 서명만으로 원 계약의 체결 사실을 확인한 것으로 보지 않는다.',
      },
      {
        id: 'termination',
        kind: 'text',
        heading: '계약조건의 변경 및 해지',
        body: '① 구매사가 사전 합의 없이 제3자의 전자결제서비스를 이용하여 독점 이용 조건을 위반한 경우, 구매사의 귀책사유로 원 계약 또는 본 합의서가 해제·해지된 경우, 구매사가 PG사에 대하여 보유한 채권에 가압류·압류명령 또는 체납처분 등 강제집행이 개시된 경우에는 PG사는 본 합의서를 해제·해지할 수 있다.\n② 위 사유가 발생하면 구매사는 약정기간 동안 실제 할인받은 수수료 금액을 반환한다. 할인액은 별첨의 표준 수수료와 최종 수수료 차이에 해당 기간의 실제 거래액 또는 결제 건수를 적용하여 산정한다. PG사는 산정 근거를 구매사에게 제공한다.\n③ PG사는 반환받을 금액을 구매사에게 지급할 정산대금에서 상계할 수 있다. 위 사유로 PG사에 별도의 손해가 발생한 경우 구매사는 그 손해를 배상한다.',
      },
      {
        id: 'confidentiality',
        kind: 'text',
        heading: '비밀유지',
        body: '양 당사자는 본 합의서의 내용과 이행 과정에서 알게 된 상대방의 업무상 비밀·자료·정보를 비밀로 유지하고, 상대방의 사전 서면동의 없이 제3자에게 공개하거나 계약 외 목적으로 사용하지 않는다. 이를 위반하여 발생한 손해는 귀책사유가 있는 당사자가 배상한다.',
      },
      {
        id: 'assignment',
        kind: 'text',
        heading: '양도금지',
        body: '각 당사자는 상대방의 사전 서면동의 없이 본 합의서에 따른 권리·의무를 제3자에게 양도·위임·위탁하거나 담보로 제공하지 않는다.',
      },
      {
        id: 'other',
        kind: 'text',
        heading: '기타',
        body: '양 당사자는 신의성실에 따라 본 합의서를 이행한다. 별도 서면합의는 본 합의서의 일부를 구성한다. 명시되지 않은 사항은 원 계약을 따르며 원 계약 또는 이전 변경계약과 충돌하는 사항은 본 합의서를 우선 적용한다.',
      },
      {
        id: 'fees',
        kind: 'feeTable',
        heading: '별첨 · 수수료 할인 기준',
        intro:
          '표준 수수료 · 할인 폭 · 최종 적용 수수료 (부가세 별도). 최종 적용 수수료는 구매사가 선정한 견적과 같다. 표에 명시한 결제수단과 가맹점 등급에 적용한다.',
        outro: '',
      },
    ],
    closing:
      '양 당사자는 본 합의서의 내용을 확인하고 전자서명하며, 양측 서명 완료일은 전자서명 기록에 따른다. 양 당사자는 서명 완료본을 전자문서로 보관한다.',
  };
}

export function agreementErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    AGREEMENT_RATES_MISSING:
      '등록된 표준 수수료가 부족해요. 관리자에게 수수료 기준 등록을 요청해 주세요.',
    AGREEMENT_RATE_BELOW_QUOTE:
      '표준 수수료가 선정한 견적보다 낮아요. 관리자에게 기준 확인을 요청해 주세요.',
    AGREEMENT_FEES_EMPTY: '선정한 견적에 수수료가 없어요. 견적 내용을 확인해 주세요.',
    AGREEMENT_FEES_INVALID: '선정한 견적의 수수료를 확인해 주세요.',
    AGREEMENT_CHANGED:
      '회사 정보나 수수료 기준이 바뀌었어요. 다시 불러와 미리보기를 확인해 주세요.',
    AGREEMENT_INCOMPLETE: '양측 회사 정보를 모두 입력해 주세요.',
    AGREEMENT_BUSY: '합의서를 발송하고 있어요. 잠시 후 다시 확인해 주세요.',
    AGREEMENT_REQUIRED: '공통 합의서 작성 화면에서 서명을 요청해 주세요.',
    AGREEMENT_TERMS_PENDING: '공통 합의서 문안을 확인하고 있어요. 확정 후 서명을 요청할 수 있어요.',
    FORBIDDEN: '이 합의서에 접근할 수 없어요.',
  };
  return messages[error] ?? '합의서를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
