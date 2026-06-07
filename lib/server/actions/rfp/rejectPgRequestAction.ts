'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z.object({ requestId: z.string().uuid() }).strict();

export type RejectPgRequestInput = z.input<typeof Input>;
export type RejectPgRequestResult = RfpActionResult;

export async function rejectPgRequestAction(
  input: RejectPgRequestInput,
): Promise<RejectPgRequestResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.rejectPgRequest(
    parsed.data.requestId,
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
