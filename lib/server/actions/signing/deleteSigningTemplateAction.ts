'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ templateId: z.string().uuid() }).strict();

export type DeleteSigningTemplateInput = z.infer<typeof Input>;

/**
 * PG — 계약서 템플릿 삭제. 이미 보낸 계약과 서명 이력은 그대로 남고, 이 템플릿을
 * 골라둔 견적의 사전 선택만 풀린다. 소유 검증은 서비스가 한다.
 */
export async function deleteSigningTemplateAction(
  input: DeleteSigningTemplateInput,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.deleteTemplate(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.templateId,
  );
}
