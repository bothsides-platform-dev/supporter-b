'use client';

import { PercentInput, CurrencyInput, FeeRateCell } from '@/components/forms/inputs';
import { FieldError } from '@/components/primitives/FieldError';
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
} from '@/lib/types/bid';

type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  /** 제출 시도 후 true — 채운 칸이 0개면 단계-레벨 에러를 표시. */
  attempted?: boolean;
};

const TIERED_LABELS: readonly string[] = TIERED_CATEGORY_LABELS;

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  attempted = false,
}: Props) {
  const requested = new Set(feeInputMethods);

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

  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
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
          카드·간편결제는 구간(영세~일반)별로 · 1칸 이상 입력하면 발송할 수 있어요
        </p>
        <span
          data-testid="fees-count"
          className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]"
        >
          {filledUnits}/{totalUnits}
        </span>
      </div>

      {attempted && filledUnits === 0 && (
        <FieldError error="수수료를 1칸 이상 입력해주세요" />
      )}

      {tieredGroups.map((group) => (
        <div key={group.label} className="space-y-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            {group.label} · 구간별 우대수수료
          </span>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-[110px]" />
                {MERCHANT_TIERS.map((t) => (
                  <th
                    key={t}
                    className="text-center font-mono text-[10px] tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)] pb-1"
                  >
                    {MERCHANT_TIER_LABELS[t]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.methods.map((m) => (
                <tr key={m}>
                  <td className="text-[13px] text-[var(--md-sys-color-on-surface)] pr-2 py-1">
                    {PAYMENT_METHOD_LABELS[m]}
                  </td>
                  {MERCHANT_TIERS.map((t, idx) => {
                    const key = `${m}:${t}`;
                    const tooltipAlign =
                      idx === 0
                        ? 'start'
                        : idx === MERCHANT_TIERS.length - 1
                          ? 'end'
                          : 'center';
                    return (
                      <td key={t} className="px-0.5 py-1">
                        <FeeRateCell
                          testId={`fee-cell-${m}-${t}`}
                          ariaLabel={`${PAYMENT_METHOD_LABELS[m]} ${MERCHANT_TIER_LABELS[t]} 수수료`}
                          value={fees[key] ?? ''}
                          onChange={(v) => onFee(key, v)}
                          tooltipAlign={tooltipAlign}
                          max={100}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {(singleMethods.length > 0 || customPaymentMethods.length > 0) && (
        <div className="space-y-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            계좌 · 기타 (단일요율)
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {singleMethods.map((m) =>
              isFlatFeeMethod(m) ? (
                // 정액(건당) 수단 — % 가 아니라 건당 '원' 정수로 입력받는다. 상한 10만원(fat-finger 가드).
                <CurrencyInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 건당 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                  max={100_000}
                />
              ) : (
                <PercentInput
                  key={m}
                  label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                  value={fees[m] ?? ''}
                  onChange={(v) => onFee(m, v)}
                  max={100}
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
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
