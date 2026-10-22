'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_retired-signing-session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import { SIGNING_TEMPLATE_NAME_MAX } from '@/lib/signing/template-limits';
import { SigningTemplateFieldInputSchema } from '@/lib/server/actions/signing/_schemas';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    name: z.string().min(1).max(SIGNING_TEMPLATE_NAME_MAX),
    uploadToken: z.string().min(1),
    fields: z.array(SigningTemplateFieldInputSchema).min(1),
  })
  .strict();

/** 배치된 필드로 스노우싸인 템플릿을 만들고 워크스페이스에 등록한다. */
export async function createSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ templateId: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.createTemplate(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
