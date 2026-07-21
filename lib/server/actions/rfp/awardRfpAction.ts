'use server';

import { after } from 'next/server';
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

  // award 커밋 후 전자서명 개시 — award tx 밖 + after()로 응답 이후 실행한다.
  // SnowSign 미응답(hang, ~15-30초)이 award 응답('선정' 버튼)을 블로킹하지 않는다.
  // 실패해도 award 는 불변(로그만) — cron 이 awaiting/미발송을 재개하고 send_failed 는
  // 딜룸에서 다시 시작할 수 있다.
  if (result.ok) {
    const runSigning = async (): Promise<void> => {
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
    };
    // 정상(요청 스코프)에서는 after()로 응답 이후 실행 — SnowSign hang 이 award 응답을
    // 막지 않는다. 요청 스코프 밖(예: awardRfpAction 을 직접 호출하는 통합 테스트)에서
    // after() 가 throw 하면 fire-and-forget 으로 폴백해 award 는 그대로 반환한다.
    try {
      after(runSigning);
    } catch {
      void runSigning();
    }
  }

  return result;
}
