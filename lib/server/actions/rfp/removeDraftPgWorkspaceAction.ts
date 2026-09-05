'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getRfpService } from '@/lib/server/services/rfp';
import type { RfpActionResult } from './_shared';

const Input = z.object({
  rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
  workspaceId: z.string().uuid(),
}).strict();

export type RemoveDraftPgWorkspaceInput = z.input<typeof Input>;
export type RemoveDraftPgWorkspaceResult = RfpActionResult;

export async function removeDraftPgWorkspaceAction(
  input: RemoveDraftPgWorkspaceInput,
): Promise<RemoveDraftPgWorkspaceResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getRfpService();
  return service.removeDraftPgWorkspace(parsed.data.rfpId, parsed.data.workspaceId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
