import { z } from 'zod';

export const tierRatesSchema = z
  .object({
    sole: z.number().min(0).max(1).optional(),
    sme1: z.number().min(0).max(1).optional(),
    sme2: z.number().min(0).max(1).optional(),
    sme3: z.number().min(0).max(1).optional(),
    general: z.number().min(0).max(1).optional(),
  })
  .strict();

export const feeField = z.union([z.number().min(0).max(1), tierRatesSchema]).optional();

export const PaymentFeesSchema = z
  .object({
    card: feeField,
    overseas_card: feeField,
    virtual_account: feeField,
    bank_transfer: feeField,
    naver_pay: feeField,
    kakao_pay: feeField,
    toss_pay: feeField,
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();
