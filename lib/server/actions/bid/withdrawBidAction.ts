'use server';

import { z } from 'zod';

import { requirePgSession } from '@/lib/auth/session';
import { getBidService } from '@/lib/server/services/bid';
import type { BidActionResult } from './_shared';

const Input = z
  .object({
    bidId: z.string().uuid(),
  })
  .strict();

export type WithdrawBidInput = z.infer<typeof Input>;
export type WithdrawBidResult = BidActionResult;

/**
 * PG 제안 철회. 세션/입력 파싱 후 BidService.withdraw 위임.
 */
export async function withdrawBidAction(
  input: WithdrawBidInput,
): Promise<WithdrawBidResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getBidService();
  return service.withdraw(parsed.data.bidId, {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  });
}
