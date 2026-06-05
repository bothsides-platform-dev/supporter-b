// Shared helpers for the bid quote template (견적 요율표) actions.
//
// Templates (`bid_quote_templates`) are PG-workspace-shared: any member of a PG
// workspace can save/list/edit/delete that workspace's templates. The security
// invariant is cross-workspace isolation — enforced here via the active PG
// session workspace, mirroring chat/_shared's requireActiveWorkspace +
// requireOwnedTemplate pattern (but PG-only).
import { requirePgSession } from '@/lib/auth/session';
import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import type { BidQuoteTemplate } from '@/lib/server/repositories/types';

// Discriminated result, structurally identical to the chat/bid action result.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type QuoteActionResult<T extends object = {}> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// The session's active PG workspace. requirePgSession throws on a
// missing/non-PG session — translate that into a discriminated failure.
export async function requirePgWorkspace(): Promise<
  | { ok: true; userId: string; workspaceId: string }
  | { ok: false; error: string }
> {
  try {
    const session = await requirePgSession();
    return {
      ok: true,
      userId: session.user.id,
      workspaceId: session.user.workspaceId,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'FORBIDDEN_PG' };
  }
}

// Load a template owned by the session's active PG workspace (cross-workspace
// guard for update/delete). Returns TEMPLATE_NOT_FOUND when absent, FORBIDDEN
// when it belongs to another workspace.
export async function requireOwnedQuoteTemplate(
  templateId: string,
): Promise<
  | { ok: true; template: BidQuoteTemplate; workspaceId: string }
  | { ok: false; error: string }
> {
  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;
  const template = await (await getBidQuoteTemplateRepo()).findById(templateId);
  if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };
  if (template.pgWsId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, template, workspaceId: ws.workspaceId };
}
