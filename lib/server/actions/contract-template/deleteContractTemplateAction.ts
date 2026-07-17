'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractTemplateService } from '@/lib/server/services/contract-template';
import type { ContractTemplateActionResult } from './_shared';

const Input = z.object({ templateId: z.string().uuid() }).strict();

export type DeleteContractTemplateInput = z.input<typeof Input>;
export type DeleteContractTemplateResult = ContractTemplateActionResult;

/**
 * PG 워크스페이스 소유 계약서 템플릿 삭제. 세션(requirePgActor) + 입력 검증 후
 * ContractTemplateService.remove 위임(소유권 검증은 서비스 레이어 책임).
 */
export async function deleteContractTemplateAction(
  input: DeleteContractTemplateInput,
): Promise<DeleteContractTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const service = await getContractTemplateService();
  return service.remove(parsed.data.templateId, { userId: actor.userId, workspaceId: actor.workspaceId });
}
