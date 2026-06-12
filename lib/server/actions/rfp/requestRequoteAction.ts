'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().uuid(),
    pgWsIds: z.array(z.string().uuid()).min(1),
    message: z.string().trim().min(1).max(2000),
    newDeadline: z.string().datetime(),
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
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

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
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
