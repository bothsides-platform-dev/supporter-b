// Shared session-boundary helpers for the unified kanban board actions.
//
// The business logic (placement + column CRUD) lives in BoardService
// (@/lib/server/services/board). What stays here is ONLY the Next-auth session
// boundary — resolving the active workspace from the session — which services
// must NOT import. Actions resolve the workspace here, then delegate.
//
// DESIGN NOTE (deviates from spec §C, deliberately): moveCard/releaseCard are
// PLACEMENT-ONLY (custom columns + default-landing release). Drops onto
// lifecycle columns that trigger a domain action (send/award/close/submit/
// withdraw) are dispatched CLIENT-side to the existing rfp/invitation actions —
// those take RFP codes / bid uuids that the card payload already carries, so
// routing them through moveCard would add pointless uuid↔code plumbing. Do not
// "fix" this back into moveCard.
import {
  requireSession,
  requireBuyerSession,
  requirePgSession,
} from '@/lib/auth/session';
import type { CardType } from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { BidActionResult } from '../bid/_shared';

// Structurally identical to the bid action result — reuse the shape.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BoardActionResult<T extends object = {}> = BidActionResult<T>;

type WorkspaceResolve =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

// rfp cards live on a buyer board; invitation cards on a pg board.
export async function workspaceIdForCard(cardType: CardType): Promise<WorkspaceResolve> {
  try {
    if (cardType === 'invitation') {
      return { ok: true, workspaceId: (await requirePgSession()).user.workspaceId };
    }
    return { ok: true, workspaceId: (await requireBuyerSession()).user.workspaceId };
  } catch {
    return { ok: false, error: cardType === 'invitation' ? 'FORBIDDEN_PG' : 'FORBIDDEN_BUYER' };
  }
}

// The session's active workspace, for column-CRUD actions (any workspace type).
export async function requireActiveWorkspace(): Promise<
  | { ok: true; workspaceId: string; workspaceType: WorkspaceType }
  | { ok: false; error: string }
> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const { workspaceId, workspaceType } = session.user;
  if (!workspaceId || !workspaceType) return { ok: false, error: 'NO_WORKSPACE' };
  return { ok: true, workspaceId, workspaceType };
}
