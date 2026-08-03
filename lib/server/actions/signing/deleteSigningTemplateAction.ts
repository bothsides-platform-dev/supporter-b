'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ templateId: z.string().min(1) }).strict();

/** 계약서 템플릿 삭제(하드) — 소유 워크스페이스만. 견적 사전 선택은 SET NULL로 풀린다. */
export async function deleteSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.remove({ userId: actor.userId, workspaceId: actor.workspaceId }, parsed.data.templateId);
}
