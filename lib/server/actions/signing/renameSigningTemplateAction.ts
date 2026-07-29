'use server';

import { z } from 'zod';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

const Input = z
  .object({
    templateId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export type RenameSigningTemplateInput = z.infer<typeof Input>;

/** PG — 계약서 템플릿 이름 변경. 소유 검증은 서비스(워크스페이스 스코프)가 한다. */
export async function renameSigningTemplateAction(
  input: RenameSigningTemplateInput,
): Promise<ActionResult> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const service = await getContractSigningService();
  return service.renameTemplate(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    parsed.data.templateId,
    parsed.data.name,
  );
}
