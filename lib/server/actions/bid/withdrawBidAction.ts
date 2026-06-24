'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getBidService } from '@/lib/server/services/bid';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    bidId: z.string().uuid(),
  })
  .strict();

export type WithdrawBidInput = z.infer<typeof Input>;
export type WithdrawBidResult = ActionResult;

/**
 * PG 제안 철회. 세션/입력 파싱 후 BidService.withdraw 위임.
 */
export async function withdrawBidAction(
  input: WithdrawBidInput,
): Promise<WithdrawBidResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  return service.withdraw(parsed.data.bidId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
