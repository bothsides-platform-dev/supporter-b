import { z } from 'zod';

import { MERCHANT_TIERS } from '@/lib/types/bid';

// 구간 키는 MERCHANT_TIERS 에서 파생한다 — 여기서 따로 나열하면 새 등급 추가 시
// .strict() 가 그 등급의 요율을 "알 수 없는 키"로 조용히 거부한다(입력이 저장되지 않음).
const tierRatesSchema = z
  .object(
    Object.fromEntries(
      MERCHANT_TIERS.map((tier) => [tier, z.number().min(0).max(1).optional()]),
    ) as Record<(typeof MERCHANT_TIERS)[number], z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

const feeField = z.union([z.number().min(0).max(1), tierRatesSchema]).optional();

// 정액(건당) 수단 — 0~1 소수 요율이 아니라 '원' 단위 정수(상한 없음).
// 정적 타입은 다른 수단과 동일하게 number | TierRates 로 유지(broad 한 paymentFees 맵이
// 그대로 대입되도록)하되, 런타임에선 구간맵을 거부해 정액 수단의 단일 정수만 통과시킨다.
const flatFeeField = z
  .union([z.number().int().nonnegative(), tierRatesSchema])
  .refine((v) => typeof v === 'number', { message: '정액(건당) 수단은 구간맵을 가질 수 없습니다' })
  .optional();

export const PaymentFeesSchema = z
  .object({
    card: feeField,
    overseas_card: feeField,
    virtual_account: flatFeeField,
    bank_transfer: feeField,
    naver_pay: feeField,
    kakao_pay: feeField,
    toss_pay: feeField,
    apple_pay: feeField,
    samsung_pay: feeField,
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();
