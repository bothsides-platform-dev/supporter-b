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
  })
  .strict();

export type LinkSigningTemplateInput = z.infer<typeof Input>;

/**
 * PG — SnowSign 템플릿을 워크스페이스에 링크한다(역할/변수 매핑).
 * 링크는 어떤 계약도 발송하지 않는다 — 발송은 딜룸의 명시적 확인뿐이다.
 */
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
