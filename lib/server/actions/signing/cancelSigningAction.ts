'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({ contractId: z.string().uuid(), reason: z.string().max(500).optional() })
  .strict();

/** 딜룸 — 전자서명 취소(SnowSign 전파). ACL 은 서비스(양측)에서 검증. */
export async function cancelSigningAction(input: {
  contractId: string;
  reason?: string;
}): Promise<ActionResult> {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.cancel(
    parsed.data.contractId,
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.reason,
  );
}
