'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z.object({ requestId: z.string().uuid() }).strict();

export type AcceptPgRequestInput = z.input<typeof Input>;
export type AcceptPgRequestResult = RfpActionResult;

export async function acceptPgRequestAction(
  input: AcceptPgRequestInput,
): Promise<AcceptPgRequestResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.acceptPgRequest(
    parsed.data.requestId,
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );
}
