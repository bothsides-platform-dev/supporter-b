'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().uuid(),
    awardedBidId: z.string().uuid(),
  })
  .strict();

export type AwardRfpInput = z.infer<typeof Input>;
export type AwardRfpResult = RfpActionResult;

/**
 * RFP 최종 선택(선정) 확정. 세션/입력 파싱 후 RfpService.award 위임.
 */
export async function awardRfpAction(
  input: AwardRfpInput,
): Promise<AwardRfpResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.award(parsed.data.rfpId, parsed.data.awardedBidId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
