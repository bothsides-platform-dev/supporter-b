'use server';

import { z } from 'zod';

import { requireBuyerSession } from '@/lib/auth/session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
  })
  .strict();

export type SendDraftInvitationsInput = z.input<typeof Input>;
export type SendDraftInvitationsResult = RfpActionResult<{ sentCount: number }>;

export async function sendDraftInvitationsAction(
  input: SendDraftInvitationsInput,
): Promise<SendDraftInvitationsResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.sendDraftInvitations(
    parsed.data.rfpId,
    { userId: session.user.id, workspaceId: session.user.workspaceId },
  );
}
