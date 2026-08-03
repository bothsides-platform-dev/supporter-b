'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z.object({ templateId: z.string().min(1), name: z.string().min(1).max(80) }).strict();

/** 계약서 템플릿 이름 변경 — 소유 워크스페이스만. */
export async function renameSigningTemplateAction(
  input: z.input<typeof Input>,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.rename(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.templateId,
    parsed.data.name,
  );
}
