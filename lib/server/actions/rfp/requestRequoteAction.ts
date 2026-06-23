'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().uuid(),
    pgWsIds: z.array(z.string().uuid()).min(1),
    message: z.string().trim().min(1).max(2000),
    // offset: true — +09:00 형식(KST 끝) 허용. createRfpAction 과 동일.
    newDeadline: z.string().datetime({ offset: true }),
  })
  .strict();

export type RequestRequoteInput = z.input<typeof Input>;
export type RequestRequoteResult = RfpActionResult;

/**
 * 견적 재요청. 세션/입력 파싱 후 RfpService.requote 위임.
 * rfpId 는 uuid(상세 화면의 rfp.id)를 그대로 받는다 — awardRfpAction 과 동일.
 */
export async function requestRequoteAction(
  input: RequestRequoteInput,
): Promise<RequestRequoteResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.requote(
    parsed.data.rfpId,
    {
      targetPgWsIds: parsed.data.pgWsIds,
      message: parsed.data.message,
      newDeadline: new Date(parsed.data.newDeadline),
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );
}
