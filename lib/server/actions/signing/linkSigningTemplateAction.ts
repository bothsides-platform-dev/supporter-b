'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    snowsignTemplateId: z.string().min(1),
    name: z.string().min(1),
    roleMapping: z.record(z.string(), z.enum(['buyer', 'pg'])),
    variableMapping: z.record(z.string(), z.string()).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export type LinkSigningTemplateInput = z.infer<typeof Input>;

/** PG — SnowSign 템플릿을 워크스페이스에 링크(역할/변수 매핑) 후 awaiting 자동 발송. */
export async function linkSigningTemplateAction(
  input: LinkSigningTemplateInput,
): Promise<ActionResult<{ templateId: string }>> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.linkTemplate(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data,
  );
}
