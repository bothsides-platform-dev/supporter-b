'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractTemplateService } from '@/lib/server/services/contract-template';
import type { ContractTemplateActionResult } from './_shared';

const Input = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200).optional(),
    attachmentId: z.string().uuid(),
  })
  .strict();

export type SaveContractTemplateInput = z.input<typeof Input>;
export type SaveContractTemplateResult = ContractTemplateActionResult<{ templateId: string }>;

/**
 * PG 워크스페이스 계약서 PDF 템플릿 생성. 세션(requirePgActor) + 입력 검증 후
 * ContractTemplateService.save 위임(첨부 소유·PDF 유효성·워크스페이스 상한은
 * 서비스 레이어 책임).
 */
export async function saveContractTemplateAction(
  input: SaveContractTemplateInput,
): Promise<SaveContractTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const service = await getContractTemplateService();
  return service.save(
    {
      name: parsed.data.name,
      description: parsed.data.description,
      attachmentId: parsed.data.attachmentId,
    },
    { userId: actor.userId, workspaceId: actor.workspaceId },
  );
}
