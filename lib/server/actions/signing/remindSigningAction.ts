'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ contractId: z.string().uuid() }).strict();

/** 딜룸 — 서명 대기자에게 리마인더. ACL 은 서비스(양측)에서 검증. */
export async function remindSigningAction(input: { contractId: string }): Promise<ActionResult> {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.remind(parsed.data.contractId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
