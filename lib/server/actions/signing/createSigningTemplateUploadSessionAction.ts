'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    filename: z.string().min(1),
    contentType: z.literal('application/pdf'),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  })
  .strict();

/** 계약서 템플릿 PDF 업로드용 presigned 세션 발급. */
export async function createSigningTemplateUploadSessionAction(
  input: z.input<typeof Input>,
): Promise<ActionResult<{ uploadId: string; uploadUrl: string; fields: Record<string, string> }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const service = await getSigningTemplateService();
  return service.createUploadSession(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
