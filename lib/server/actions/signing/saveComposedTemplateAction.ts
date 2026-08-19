'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import { ContractDocSchema } from '@/lib/contract-doc/schema';
import { SIGNING_TEMPLATE_NAME_MAX } from '@/lib/signing/template-limits';
import type { ActionResult } from '@/lib/server/actions/_result';

/**
 * 생성과 수정을 한 액션이 맡는다(`saveQuoteTemplateAction` 선례) — `templateId` 가
 * 있으면 수정, 없으면 생성. 폼이 하나이므로 액션도 하나인 편이 호출부가 단순하다.
 */
const Input = z
  .object({
    templateId: z.string().min(1).optional(),
    name: z.string().min(1).max(SIGNING_TEMPLATE_NAME_MAX),
    document: ContractDocSchema,
  })
  .strict();

export async function saveComposedTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ templateId?: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  const svcActor = { userId: actor.userId, workspaceId: actor.workspaceId };

  if (parsed.data.templateId) {
    return service.updateComposedTemplate(svcActor, {
      templateId: parsed.data.templateId,
      name: parsed.data.name,
      document: parsed.data.document,
    });
  }
  return service.createComposedTemplate(svcActor, {
    name: parsed.data.name,
    document: parsed.data.document,
  });
}
