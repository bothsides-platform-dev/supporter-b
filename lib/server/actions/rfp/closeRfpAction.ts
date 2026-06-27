'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z.object({ rfpId: z.string().min(1) }).strict();

export type CloseRfpInput = z.infer<typeof Input>;
export type CloseRfpResult = RfpActionResult;

/**
 * RFP 마감. 세션/입력 파싱 + code→UUID 해소 후 RfpService.close 위임.
 */
export async function closeRfpAction(
  input: CloseRfpInput,
): Promise<CloseRfpResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  // UI passes human code (P-YYMM-NNNN); service uses UUID.
  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findByCode(parsed.data.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };

  const service = await getRfpService();
  return service.close(rfp.id, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
