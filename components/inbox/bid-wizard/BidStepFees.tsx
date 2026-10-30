'use client';

import { PercentInput, CurrencyInput, FeeRateCell } from '@/components/forms/inputs';
import { FieldError } from '@/components/primitives/FieldError';
import { isFeeFilled } from './bid-wizard-validation';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  TIERED_CATEGORY_LABELS,
  isTieredMethod,
  isFlatFeeMethod,
  type CustomPaymentMethod,
  type PaymentMethod,
  type MerchantTier,
} from '@/lib/types/bid';

type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  /** 제출 시도 후 true — 채운 칸이 0개면 단계-레벨 에러를 표시. */
  attempted?: boolean;
  buyerTier?: MerchantTier;
};

const TIERED_LABELS: readonly string[] = TIERED_CATEGORY_LABELS;

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  attempted = false,
  buyerTier,
}: Props) {
  const requested = new Set(feeInputMethods);
  const tiers = buyerTier ? [buyerTier, ...MERCHANT_TIERS.filter(t => t !== buyerTier)] : MERCHANT_TIERS;

  // 구간 카테고리(카드·간편결제)별로 요청된 수단 행 묶음
  const tieredGroups = PAYMENT_METHOD_CATEGORIES.filter((c) =>
    TIERED_LABELS.includes(c.label),
  )
    .map((c) => ({
      label: c.label,
      methods: c.methods.filter((m) => requested.has(m) && isTieredMethod(m)),
    }))
    .filter((g) => g.methods.length > 0);

  // 단일요율 수단(계좌·기타 등 비-구간 요청수단)
  const singleMethods = feeInputMethods.filter((m) => !isTieredMethod(m));

  const feeFilled = (key: string) => isFeeFilled(fees, key);
  const tieredCellCount = tieredGroups.reduce(
    (n, g) => n + g.methods.length * MERCHANT_TIERS.length,
    0,
  );
  const totalUnits = tieredCellCount + singleMethods.length + customPaymentMethods.length;
  const filledUnits =
    tieredGroups.reduce(
      (n, g) =>
        n +
        g.methods.reduce(
          (mm, m) => mm + MERCHANT_TIERS.filter((t) => feeFilled(`${m}:${t}`)).length,
          0,
        ),
      0,
    ) +
    singleMethods.filter((m) => feeFilled(m)).length +
    customPaymentMethods.filter((c) => feeFilled(c.id)).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          카드와 간편결제는 구간(영세~일반)별로 입력해요. 1칸 이상 입력하면 발송할 수 있어요
        </p>
        <span
          data-testid="fees-count"
          className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)]"
        >
          {filledUnits}/{totalUnits}
        </span>
      </div>

      {attempted && filledUnits === 0 && (
        <FieldError error="수수료를 1칸 이상 입력해주세요" />
      )}

      {buyerTier && <p className="text-[14px] font-semibold text-[var(--md-sys-color-primary)]">구매사 적용 등급 · {MERCHANT_TIER_LABELS[buyerTier]}</p>}
      {tieredGroups.flatMap(group => group.methods).map(m => (
        <fieldset key={m} className="min-w-0 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-3">
          <legend className="px-1 text-[14px] font-semibold">{PAYMENT_METHOD_LABELS[m]}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tiers.map(t => {
              const key = `${m}:${t}`;
              const idx = MERCHANT_TIERS.indexOf(t);
              return <div key={t} className={`min-w-0 rounded-[6px] p-2 ${t === buyerTier ? 'col-span-2 border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] sm:col-span-3' : ''}`}>
                <span className="mb-1 block text-[13px]">{MERCHANT_TIER_LABELS[t]}{t === buyerTier && ' · 적용 등급'}</span>
                <FeeRateCell testId={`fee-cell-${m}-${t}`} ariaLabel={`${PAYMENT_METHOD_LABELS[m]} ${MERCHANT_TIER_LABELS[t]} 수수료`}
                  value={fees[key] ?? ''} onChange={v => onFee(key, v)}
                  tooltipAlign={idx === 0 ? 'start' : idx === MERCHANT_TIERS.length - 1 ? 'end' : 'center'} max={100} decimalScale={12} />
              </div>;
            })}
          </div>
        </fieldset>
      ))}

      {(singleMethods.length > 0 || customPaymentMethods.length > 0) && (
        <div className="space-y-2">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            계좌 및 기타 결제수단(단일요율)
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {singleMethods.map((m) =>
              isFlatFeeMethod(m) ? (
                // 정액(건당) 수단 — % 가 아니라 건당 '원' 정수로 입력받는다(상한 없음).
                <CurrencyInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 건당 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                />
              ) : (
                <PercentInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                  max={100}
                  decimalScale={12}
                />
              ),
            )}
            {customPaymentMethods.map((c) => (
              <PercentInput
                key={c.id}
                label={`${c.label} 수수료`}
                value={fees[c.id] ?? ''}
                onChange={(v) => onFee(c.id, v)}
                max={100}
                decimalScale={12}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
