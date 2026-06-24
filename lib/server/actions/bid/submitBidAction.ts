'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getBidService } from '@/lib/server/services/bid';
import type { ActionResult } from '@/lib/server/actions/_result';
import { PaymentFeesSchema } from '@/lib/rfp/payment-fees-schema';

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
export type SubmitBidResult = ActionResult<{ bidId: string }>;

export async function submitBidAction(input: SubmitBidInput): Promise<SubmitBidResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  const result = await service.submit(
    {
      rfpId: parsed.data.rfpId,
      settleCycle: parsed.data.settleCycle,
      settleLimit: parsed.data.settleLimit,
      guaranteeInsurance: parsed.data.guaranteeInsurance,
      paymentFees: parsed.data.paymentFees,
      customFees: parsed.data.customFees,
      proposalAttachmentId: parsed.data.proposalAttachmentId,
      memo: parsed.data.memo,
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );

  if (result.ok) {
    revalidatePath(`/inbox/${result.rfpCode}`);
  }
  return result.ok ? { ok: true, bidId: result.bidId } : result;
}
