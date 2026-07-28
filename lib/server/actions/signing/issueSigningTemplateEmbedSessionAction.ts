'use server';

import { requirePgActor } from '@/lib/server/actions/_session';
import { getContractSigningService } from '@/lib/server/services/contract-signing';
import type { ActionResult } from '@/lib/server/actions/_result';

/** PG — template_draft Embed 세션(iframe_url) 발급. 자사 계약서를 앱 안에서 1회 등록. */
export async function issueSigningTemplateEmbedSessionAction(): Promise<
  ActionResult<{ iframeUrl: string; sessionId: string }>
> {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  const service = await getContractSigningService();
  return service.createTemplateEmbedSession({
    userId: actor.userId,
    workspaceId: actor.workspaceId,
  });
}
