'use server';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';
import type { PgSigningTemplate } from '@/lib/types/signing';

/** PG — 자기 워크스페이스에 링크된 계약서 템플릿 목록(org 스코프). */
export async function listSigningTemplatesAction(): Promise<
  ActionResult<{ templates: PgSigningTemplate[] }>
> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const service = await getContractSigningService();
  return service.listTemplates({ userId: actor.userId, workspaceId: actor.workspaceId });
}
