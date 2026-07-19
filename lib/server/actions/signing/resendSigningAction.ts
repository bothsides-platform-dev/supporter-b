'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/** 딜룸 — 재발송(활성 계약 취소 후 새 라운드). ACL 은 서비스(양측)에서 검증. */
export async function resendSigningAction(input: { rfpCode: string }): Promise<ActionResult> {
  const actor = await requireActiveWorkspace();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.resend(rfp.id, { userId: actor.userId, workspaceId: actor.workspaceId });
}
