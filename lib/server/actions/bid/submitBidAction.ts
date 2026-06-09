'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { requirePgSession } from '@/lib/auth/session';
import { getBidService } from '@/lib/server/services/bid';
import type { BidActionResult } from './_shared';

const feeField = z.number().min(0).max(1).optional();

const PaymentFeesSchema = z
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

const Input = z
  .object({
    rfpId: z.string().min(1),
    settleCycle: z.string().min(1),
    settleLimit: z.number().nonnegative(),
    guaranteeInsurance: z.number().nonnegative(),
    paymentFees: PaymentFeesSchema,
    customFees: z.record(z.string(), z.number().min(0).max(1)).optional().default({}),
    proposalAttachmentId: z.string().uuid().optional(),
    memo: z.string().max(2000).optional(),
  })
  .strict();

export type SubmitBidInput = z.input<typeof Input>;
export type SubmitBidResult = BidActionResult<{ bidId: string }>;

export async function submitBidAction(input: SubmitBidInput): Promise<SubmitBidResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  const result = await service.submit(
    {
      rfpId: parsed.data.rfpId,
      settleCycle: parsed.data.settleCycle,
      settleLimit: parsed.data.settleLimit,
      guaranteeInsurance: parsed.data.guaranteeInsurance,
      paymentFees: parsed.data.paymentFees as Record<string, number | import('@/lib/types/bid').TierRates>,
      customFees: parsed.data.customFees,
      proposalAttachmentId: parsed.data.proposalAttachmentId,
      memo: parsed.data.memo,
    },
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );

  if (result.ok) {
    revalidatePath(`/inbox/${result.rfpCode}`);
  }
  return result.ok ? { ok: true, bidId: result.bidId } : result;
}
