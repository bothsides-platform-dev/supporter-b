'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    rfpCode: z.string().min(1),
    templateId: z.string().uuid(),
  })
  .strict();

export type SendSigningContractInput = z.infer<typeof Input>;

/**
 * 딜룸 — PG 가 계약서를 확인하고 발송한다. 전자서명의 유일한 명시적 발송 경로.
 * PG 세션 게이트가 한 겹, 서비스의 낙찰-PG 당사자 검증이 또 한 겹(구매사는 남의
 * 계약서를 고를 수 없다). 템플릿 소유·동시발송 직렬화도 서비스가 맡는다.
 */
export async function sendSigningContractAction(
  input: SendSigningContractInput,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const rfp = await (await getRfpRepo()).findByCode(parsed.data.rfpCode);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  const service = await getContractSigningService();
  return service.sendContract(rfp.id, parsed.data.templateId, {
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
