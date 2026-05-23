// Unified kanban data loader — subsumes buyer-kanban-loader + pg-kanban-loader
// and the bid board. server-only (imports the repo factory). A single call
// returns homogeneous cards (one cardType): pipeline+buyer → rfp,
// pipeline+pg → invitation, rfp_bids → bid.
import {
  getColumnRepo,
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpPlacementRepo,
  getInvitationPlacementRepo,
  getBidPlacementRepo,
} from '@/lib/server/repositories/factory';
import {
  classifyBuyerRfp,
  toBuyerCard,
  compareBuyerCards,
} from '@/lib/server/buyer-kanban';
import {
  classifyPgInvitation,
  toPgCard,
  comparePgCards,
} from '@/lib/server/pg-kanban';
import { resolveCardColumn } from './resolveCardColumn';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
import type {
  BoardCard,
  BoardColumn,
  BoardData,
  CardType,
  ColumnKind,
  Placement,
} from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { Bid } from '@/lib/types/bid';

export type { BoardCard, BoardData };

// Bids in the default-landing column have no domain comparator — newest first.
function compareBids(a: Bid, b: Bid): number {
  const ta = a.submittedAt ?? '';
  const tb = b.submittedAt ?? '';
  if (ta !== tb) return tb < ta ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareInColumn(cardType: CardType): (a: BoardCard, b: BoardCard) => number {
  return (a, b) => {
    // Custom columns hold only placed cards (position set) → fractional order.
    if (a.position != null && b.position != null) {
      return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
    }
    // Lifecycle / default columns hold only classifier-derived cards.
    switch (cardType) {
      case 'rfp':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return compareBuyerCards(a.payload as any, b.payload as any);
      case 'invitation':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return comparePgCards(a.payload as any, b.payload as any);
      case 'bid':
        return compareBids(a.payload as Bid, b.payload as Bid);
    }
  };
}

// Order cards within each column. Columns are homogeneous (all placed or all
// classifier-derived), so a single comparator suffices per column.
function sortCards(
  cards: BoardCard[],
  columns: BoardColumn[],
  cardType: CardType,
): BoardCard[] {
  const cmp = compareInColumn(cardType);
  const out: BoardCard[] = [];
  for (const col of columns) {
    out.push(...cards.filter((c) => c.columnId === col.id).sort(cmp));
  }
  // Defensive: any card whose column isn't in the list (shouldn't happen).
  const known = new Set(columns.map((c) => c.id));
  out.push(...cards.filter((c) => !known.has(c.columnId)));
  return out;
}

export async function loadBoard(args: {
  workspaceId: string;
  workspaceType: WorkspaceType;
  kind: ColumnKind;
  scope?: { rfpId: string };
}): Promise<BoardData> {
  const { workspaceId, workspaceType, kind, scope } = args;
  const colRepo = await getColumnRepo();
  const columns = await colRepo.listByBoard(workspaceId, kind);

  if (kind === 'rfp_bids') {
    if (!scope?.rfpId) {
      throw new Error('loadBoard: rfp_bids requires scope.rfpId');
    }
    const [bidRepo, placementRepo] = await Promise.all([
      getBidRepo(),
      getBidPlacementRepo(),
    ]);
    const bidList = await bidRepo.findByRfp(scope.rfpId);
    const placements = await placementRepo.listByCards(bidList.map((b) => b.id));
    const cards: BoardCard[] = bidList.map((bid) => {
      const placement = placements.get(bid.id);
      return {
        cardType: 'bid',
        cardId: bid.id,
        columnId: resolveCardColumn({
          lifecycleKey: DEFAULT_LANDING_KEY,
          placement,
          columns,
        }),
        position: placement?.position ?? null,
        payload: bid,
      };
    });
    return { columns, cards: sortCards(cards, columns, 'bid') };
  }

  // pipeline
  if (workspaceType === 'buyer') {
    const [rfpRepo, bidRepo, invRepo, placementRepo] = await Promise.all([
      getRfpRepo(),
      getBidRepo(),
      getInvitationRepo(),
      getRfpPlacementRepo(),
    ]);
    const rfpList = await rfpRepo.findByBuyerWs(workspaceId);
    const rfpIds = rfpList.map((r) => r.id);
    const [bidsByRfp, invsByRfp, placements] = await Promise.all([
      bidRepo.findByRfpIds(rfpIds),
      invRepo.findByRfpIds(rfpIds),
      placementRepo.listByCards(rfpIds),
    ]);
    const now = new Date();
    const cards: BoardCard[] = rfpList.map((rfp) => {
      const b = bidsByRfp.get(rfp.id) ?? [];
      const invitations = invsByRfp.get(rfp.id) ?? [];
      const stage = classifyBuyerRfp({ rfp, bids: b, invitations, now });
      const placement: Placement | undefined = placements.get(rfp.id);
      return {
        cardType: 'rfp',
        cardId: rfp.id,
        columnId: resolveCardColumn({ lifecycleKey: stage, placement, columns }),
        position: placement?.position ?? null,
        payload: toBuyerCard({ rfp, bids: b, invitations, stage }),
      };
    });
    return { columns, cards: sortCards(cards, columns, 'rfp') };
  }

  // pipeline + pg
  const [invRepo, bidRepo, placementRepo] = await Promise.all([
    getInvitationRepo(),
    getBidRepo(),
    getInvitationPlacementRepo(),
  ]);
  const [pairs, bidList] = await Promise.all([
    invRepo.findByPgWorkspace(workspaceId),
    bidRepo.findByPgWs(workspaceId),
  ]);
  const bidByRfp = new Map<string, Bid>();
  for (const b of bidList) bidByRfp.set(b.rfpId, b);
  const placements = await placementRepo.listByCards(pairs.map((p) => p.invitation.id));
  const cards: BoardCard[] = pairs.map(({ invitation, rfp }) => {
    const bid = bidByRfp.get(rfp.id);
    const stage = classifyPgInvitation({ invitation, bid, rfp });
    const placement = placements.get(invitation.id);
    return {
      cardType: 'invitation',
      cardId: invitation.id,
      columnId: resolveCardColumn({ lifecycleKey: stage, placement, columns }),
      position: placement?.position ?? null,
      payload: toPgCard({ invitation, bid, rfp, stage }),
    };
  });
  return { columns, cards: sortCards(cards, columns, 'invitation') };
}
