'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireBuyerActor } from '../_session';
import { getRfpService } from '@/lib/server/services/rfp';
import { getRfpRepo } from '@/lib/server/repositories/factory';

const Input = z.object({
  rfpId: z.string().uuid(),
  expectedDeadline: z.string().datetime({ offset: true }),
  newDeadline: z.string().datetime({ offset: true }),
  expectedReviewId: z.string().uuid().optional(),
  reopen: z.boolean(),
}).strict();

export async function changeRfpDeadlineAction(input: {
  rfpId: string;
  expectedDeadline: string;
  newDeadline: string;
  expectedReviewId?: string;
  reopen: boolean;
}) {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
  const { rfpId, expectedDeadline, newDeadline, expectedReviewId, reopen } = parsed.data;
  const result = await (await getRfpService()).extendDeadline(rfpId, expectedDeadline, new Date(newDeadline), actor, expectedReviewId, reopen);
  if (result.ok) {
    const rfp = await (await getRfpRepo()).findById(rfpId);
    if (rfp) { revalidatePath(`/rfp/${rfp.code}`); revalidatePath(`/inbox/${rfp.code}`); }
  }
  return result;
}
