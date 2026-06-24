// Shared helpers for the bid quote template (견적 요율표) actions.
//
// Templates (`bid_quote_templates`) are PG-workspace-shared: any member of a PG
// workspace can save/list/edit/delete that workspace's templates. The security
// invariant is cross-workspace isolation. The session boundary lives here
// (requirePgWorkspace, PG-only); the cross-workspace ownership guard + the cap
// now live in QuoteTemplateService.
import { requirePgSession } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/server/actions/_result';

// Discriminated result, structurally identical to the chat/bid action result.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type QuoteActionResult<T extends object = {}> = ActionResult<T>;

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
