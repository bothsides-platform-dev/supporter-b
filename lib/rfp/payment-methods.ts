import {
  PAYMENT_METHOD_LABELS,
  type CustomPaymentMethod,
  type PaymentMethod,
} from '@/lib/types/bid';

/** 구매사가 요청한 기본·커스텀 결제수단을 입력 순서대로 표시한다. */
export function formatRequestedPaymentMethods(
  required: readonly PaymentMethod[],
  custom: readonly Pick<CustomPaymentMethod, 'label'>[],
): string | undefined {
  const labels = [
    ...required.map((method) => PAYMENT_METHOD_LABELS[method]),
    ...custom.map((method) => method.label),
  ];
  return labels.length > 0 ? labels.join(' · ') : undefined;
}
