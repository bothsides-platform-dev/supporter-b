// Shared helpers for the unified kanban board actions.
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
import {
  getColumnRepo,
  getRfpRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import type { BoardColumn, CardType } from '@/lib/types/column';
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

// Load a column owned by the session's active workspace (cross-workspace guard
// for every column mutation). Used by rename/recolor/reorder/delete.
export async function requireOwnedColumn(
  columnId: string,
): Promise<
  | { ok: true; column: BoardColumn; workspaceId: string }
  | { ok: false; error: string }
> {
  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;
  const column = await (await getColumnRepo()).findById(columnId);
  if (!column) return { ok: false, error: 'COLUMN_NOT_FOUND' };
  if (column.workspaceId !== ws.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, column, workspaceId: ws.workspaceId };
}

// Set (or clear, with null) a card's board_column_id via its own card repo.
export async function setCardBoardColumn(
  cardType: CardType,
  cardId: string,
  columnId: string | null,
): Promise<void> {
  if (cardType === 'rfp') {
    await (await getRfpRepo()).setBoardColumn(cardId, columnId);
    return;
  }
  await (await getInvitationRepo()).setBoardColumn(cardId, columnId);
}

// Does this card belong to the given workspace's board? rfp cards are owned by
// the buyer workspace; invitation cards by the pg workspace.
export async function cardBelongsToWorkspace(
  cardType: CardType,
  cardId: string,
  workspaceId: string,
): Promise<boolean> {
  if (cardType === 'rfp') {
    const rfp = await (await getRfpRepo()).findById(cardId);
    return !!rfp && rfp.buyerWsId === workspaceId;
  }
  const inv = await (await getInvitationRepo()).findById(cardId);
  return !!inv && inv.pgWsId === workspaceId;
}
