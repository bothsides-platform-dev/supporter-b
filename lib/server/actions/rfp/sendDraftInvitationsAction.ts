'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
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
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.sendDraftInvitations(
    parsed.data.rfpId,
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );
}
