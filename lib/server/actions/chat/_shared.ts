// Shared helpers for the chat actions.
//
// Templates (`chat_message_templates`) are workspace-shared: any member of a
// workspace can save/list/delete that workspace's templates. The security
// invariant is cross-workspace isolation — enforced here via the active
// session workspace, mirroring board/_shared's requireActiveWorkspace +
// requireOwnedColumn pattern.
import { requireActiveWorkspace } from '@/lib/server/actions/_session';
export { requireActiveWorkspace };
import { getChatTemplateRepo } from '@/lib/server/repositories/factory';
import type { ChatMessageTemplate } from '@/lib/server/repositories/types';

import type { ActionResult } from '@/lib/server/actions/_result';

// Discriminated result, structurally identical to the bid/board action result.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ChatActionResult<T extends object = {}> = ActionResult<T>;

// Load a template owned by the session's active workspace (cross-workspace
// guard for delete). Returns TEMPLATE_NOT_FOUND when absent, FORBIDDEN when it
// belongs to another workspace.
export async function requireOwnedTemplate(
  templateId: string,
): Promise<
  | { ok: true; template: ChatMessageTemplate; workspaceId: string }
  | { ok: false; error: string }
> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const template = await (await getChatTemplateRepo()).findById(templateId);
  if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
  if (template.workspaceId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, template, workspaceId: ws.workspaceId };
}
