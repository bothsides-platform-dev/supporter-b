'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { SigningContract, SigningParticipant } from '@/lib/types/signing';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/** 딜룸 — 현재 전자서명 상태(계약 + 참여자). ACL 은 서비스(양측)에서 검증. */
export async function getSigningStatusAction(input: {
  rfpCode: string;
}): Promise<ActionResult<{ contract: SigningContract; participants: SigningParticipant[] }>> {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.getForActor(rfp.id, { userId: actor.userId, workspaceId: actor.workspaceId });
}
