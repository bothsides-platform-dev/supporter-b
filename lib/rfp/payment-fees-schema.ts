import { z } from 'zod';

const tierRatesSchema = z
  .object({
    sole: z.number().min(0).max(1).optional(),
    sme1: z.number().min(0).max(1).optional(),
    sme2: z.number().min(0).max(1).optional(),
    sme3: z.number().min(0).max(1).optional(),
    general: z.number().min(0).max(1).optional(),
  })
  .strict();

const feeField = z.union([z.number().min(0).max(1), tierRatesSchema]).optional();

// 정액(건당) 수단 — 0~1 소수 요율이 아니라 '원' 단위 정수. 상한은 fat-finger 가드.
// 정적 타입은 다른 수단과 동일하게 number | TierRates 로 유지(broad 한 paymentFees 맵이
// 그대로 대입되도록)하되, 런타임에선 구간맵을 거부해 정액 수단의 단일 정수만 통과시킨다.
const flatFeeField = z
  .union([z.number().int().nonnegative().max(100_000), tierRatesSchema])
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
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();
