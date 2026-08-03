'use server';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getSigningTemplateService } from '@/lib/server/services/signing-template';
import type { PgSigningTemplate } from '@/lib/types/signing';
import type { ActionResult } from '@/lib/server/actions/_result';

/** 세션의 PG 워크스페이스가 보유한 계약서 템플릿 목록. */
export async function listSigningTemplatesAction(): Promise<
  ActionResult<{ templates: PgSigningTemplate[] }>
> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;

  const service = await getSigningTemplateService();
  return service.list({ userId: actor.userId, workspaceId: actor.workspaceId });
}
