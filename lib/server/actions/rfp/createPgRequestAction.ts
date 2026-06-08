'use server';

import { z } from 'zod';

import { requirePgSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
    message: z.string().trim().min(1).max(1000),
  })
  .strict();

export type CreatePgRequestInput = z.input<typeof Input>;
export type CreatePgRequestResult = RfpActionResult;

export async function createPgRequestAction(
  input: CreatePgRequestInput,
): Promise<CreatePgRequestResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.createPgRequest(
    parsed.data.rfpId,
    parsed.data.message,
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
