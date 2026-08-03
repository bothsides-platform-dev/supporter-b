'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ rfpCode: z.string().min(1) }).strict();

/**
 * 딜룸 계약 탭 — 낙찰 견적에 연결된 템플릿으로 임베드 없이 발송한다.
 * ACL(낙찰 PG)·상태(awaiting)·템플릿 연결 여부는 서비스가 검증한다.
 */
export async function sendSigningContractFromTemplateAction(
  input: { rfpCode: string },
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };

  const service = await getContractSigningService();
  return service.sendFromTemplate(rfp.id, { userId: actor.userId, workspaceId: actor.workspaceId });
}
