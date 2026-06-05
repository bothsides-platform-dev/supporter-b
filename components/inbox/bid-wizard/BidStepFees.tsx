'use client';

import { Button } from '@/components/primitives/Button';
import { PercentInput } from '@/components/forms/inputs';
import {
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';

type Props = {
  feeInputMethods: PaymentMethod[];
  customPaymentMethods: CustomPaymentMethod[];
  fees: Record<string, string>;
  onFee: (key: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function BidStepFees({
  feeInputMethods,
  customPaymentMethods,
  fees,
  onFee,
  onBack,
  onNext,
}: Props) {
  const feeFilled = (key: string) => (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
  const total = feeInputMethods.length + customPaymentMethods.length;
  const filled =
    feeInputMethods.filter((m) => feeFilled(m)).length +
    customPaymentMethods.filter((c) => feeFilled(c.id)).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          요청된 {total}개 결제수단 · 1개 이상 입력하면 발송할 수 있어요
        </p>
        <span
          data-testid="fees-count"
          className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]"
        >
          {filled}/{total}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {feeInputMethods.map((m) => (
          <PercentInput
            key={m}
            label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
            value={fees[m] ?? ''}
            onChange={(v) => onFee(m, v)}
          />
        ))}
        {customPaymentMethods.map((c) => (
          <PercentInput
            key={c.id}
            label={`${c.label} 수수료`}
            value={fees[c.id] ?? ''}
            onChange={(v) => onFee(c.id, v)}
          />
        ))}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="text" onClick={onBack} icon={<span aria-hidden>←</span>}>
          정산 조건
        </Button>
        <Button type="button" onClick={onNext} trailingIcon={<span aria-hidden>→</span>}>
          견적서
        </Button>
      </div>
    </div>
  );
}
