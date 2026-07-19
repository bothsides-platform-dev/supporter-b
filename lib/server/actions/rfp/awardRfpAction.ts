'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { logger } from '@/lib/observability/logger';
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

  const actorCtx = { userId: actor.userId, workspaceId: actor.workspaceId };
  const service = await getRfpService();
  const result = await service.award(parsed.data.rfpId, parsed.data.awardedBidId, actorCtx);

  // award 커밋 후 전자서명 개시 — award tx 밖. 실패해도 award 는 불변(로그만).
  if (result.ok) {
    try {
      const signing = await getContractSigningService();
      const started = await signing.onAward(parsed.data.rfpId, parsed.data.awardedBidId, actorCtx);
      if (!started.ok) {
        logger.warn('award.signing_not_started', {
          rfpId: parsed.data.rfpId,
          error: started.error,
        });
      }
    } catch (e) {
      logger.error('award.signing_hook_threw', { rfpId: parsed.data.rfpId, err: String(e) });
    }
  }

  return result;
}
