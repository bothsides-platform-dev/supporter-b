'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const FieldInput = z
  .object({
    id: z.string().min(1),
    type: z.enum(['signature', 'name', 'date', 'text']),
    party: z.enum(['buyer', 'pg']),
    pageNumber: z.number().int().positive(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const Input = z
  .object({
    name: z.string().min(1).max(80),
    documentUploadId: z.string().min(1),
    fields: z.array(FieldInput).min(1),
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
