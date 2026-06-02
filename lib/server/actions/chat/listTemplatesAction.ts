'use server';

import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';
import { type ChatActionResult, requireActiveWorkspace } from './_shared';

export type ListTemplatesResult = ChatActionResult<{
  templates: ChatMessageTemplate[];
}>;

/**
 * List the chat message templates shared across the session's active
 * workspace. Cross-workspace isolation: only the session workspace's templates
 * are returned.
 */
export async function listTemplatesAction(): Promise<ListTemplatesResult> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const templates = await (await getChatTemplateRepo()).listByWorkspace(ws.workspaceId);
  return { ok: true, templates };
}
