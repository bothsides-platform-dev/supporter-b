'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import { SIGNING_TEMPLATE_NAME_MAX } from '@/lib/signing/template-limits';
import { SigningTemplateFieldInputSchema } from '@/lib/server/actions/signing/_schemas';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    templateId: z.string().min(1),
    name: z.string().min(1).max(SIGNING_TEMPLATE_NAME_MAX),
    uploadToken: z.string().min(1),
    fields: z.array(SigningTemplateFieldInputSchema).min(1),
  })
  .strict();

/**
 * 기존 템플릿 수정 저장 — SnowSign 에 수정 API 가 없어 재생성 후 링크 행 교체다.
 * 새 업로드 토큰이 필수인 이유: provider 템플릿은 항상 새 문서 업로드에서만 만들어진다.
 */
export async function updateSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ templateId: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.update({ userId: actor.userId, workspaceId: actor.workspaceId }, parsed.data);
}
