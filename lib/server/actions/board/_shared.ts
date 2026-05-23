// Shared helpers for the unified kanban board actions.
//
// DESIGN NOTE (deviates from spec §C, deliberately): moveCard/releaseCard are
// PLACEMENT-ONLY (custom columns + default-landing release). Drops onto
// lifecycle columns that trigger a domain action (send/award/close/submit/
// withdraw) are dispatched CLIENT-side to the existing rfp/bid actions — those
// take RFP codes / bid uuids that the card payload already carries, so routing
// them through moveCard would add pointless uuid↔code plumbing. Do not "fix"
// this back into moveCard.
import {
  requireSession,
  requireBuyerSession,
  requirePgSession,
} from '@/lib/auth/session';
import {
  getColumnRepo,
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpPlacementRepo,
  getInvitationPlacementRepo,
  getBidPlacementRepo,
} from '@/lib/server/repositories/factory';
import type { PlacementRepo } from '@/lib/server/repositories/types';
import type { BoardColumn, CardType, ColumnKind } from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { BidActionResult } from '../bid/_shared';

// Structurally identical to the bid action result — reuse the shape.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BoardActionResult<T extends object = {}> = BidActionResult<T>;

type WorkspaceResolve =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

// rfp/bid cards live on a buyer board; invitation cards on a pg board.
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

export function kindForCard(cardType: CardType): ColumnKind {
  return cardType === 'bid' ? 'rfp_bids' : 'pipeline';
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

export async function placementRepoFor(cardType: CardType): Promise<PlacementRepo> {
  if (cardType === 'rfp') return getRfpPlacementRepo();
  if (cardType === 'invitation') return getInvitationPlacementRepo();
  return getBidPlacementRepo();
}

// Does this card belong to the given workspace's board? rfp/bid boards are owned
// by the buyer workspace (bid via rfp.buyerWsId, NOT bid.pgWsId); invitation
// boards by the pg workspace.
export async function cardBelongsToWorkspace(
  cardType: CardType,
  cardId: string,
  workspaceId: string,
): Promise<boolean> {
  if (cardType === 'rfp') {
    const rfp = await (await getRfpRepo()).findById(cardId);
    return !!rfp && rfp.buyerWsId === workspaceId;
  }
  if (cardType === 'bid') {
    const bid = await (await getBidRepo()).findById(cardId);
    if (!bid) return false;
    const rfp = await (await getRfpRepo()).findById(bid.rfpId);
    return !!rfp && rfp.buyerWsId === workspaceId;
  }
  const inv = await (await getInvitationRepo()).findById(cardId);
  return !!inv && inv.pgWsId === workspaceId;
}
