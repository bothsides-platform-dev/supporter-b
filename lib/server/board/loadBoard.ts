// Unified kanban data loader — subsumes buyer-kanban-loader + pg-kanban-loader
// and the bid board. server-only (imports the repo factory). A single call
// returns homogeneous cards (one cardType): pipeline+buyer → rfp,
// pipeline+pg → invitation, rfp_bids → bid. Card placement lives on the card
// row (board_column_id) — no separate placement query.
import {
  getColumnRepo,
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
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
} from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { Bid } from '@/lib/types/bid';

// Bids in the default-landing / custom columns have no domain stage — newest first.
function compareBids(a: Bid, b: Bid): number {
  const ta = a.submittedAt ?? '';
  const tb = b.submittedAt ?? '';
  if (ta !== tb) return tb < ta ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Order cards within each column by the domain comparator (deadline / submittedAt).
// Custom and lifecycle columns alike — there is no per-card manual order.
function sortCards(
  cards: BoardCard[],
  columns: BoardColumn[],
  cardType: CardType,
): BoardCard[] {
  const cmp = (a: BoardCard, b: BoardCard): number => {
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
  const out: BoardCard[] = [];
  for (const col of columns) {
    out.push(...cards.filter((c) => c.columnId === col.id).sort(cmp));
  }
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
    const bidRepo = await getBidRepo();
    const bidList = await bidRepo.findByRfp(scope.rfpId);
    const cards: BoardCard[] = bidList.map((bid) => ({
      cardType: 'bid',
      cardId: bid.id,
      columnId: resolveCardColumn({
        boardColumnId: bid.boardColumnId,
        lifecycleKey: DEFAULT_LANDING_KEY,
        columns,
      }),
      payload: bid,
    }));
    return { columns, cards: sortCards(cards, columns, 'bid') };
  }

  // pipeline
  if (workspaceType === 'buyer') {
    const [rfpRepo, bidRepo, invRepo] = await Promise.all([
      getRfpRepo(),
      getBidRepo(),
      getInvitationRepo(),
    ]);
    const rfpList = await rfpRepo.findByBuyerWs(workspaceId);
    const rfpIds = rfpList.map((r) => r.id);
    const [bidsByRfp, invsByRfp] = await Promise.all([
      bidRepo.findByRfpIds(rfpIds),
      invRepo.findByRfpIds(rfpIds),
    ]);
    const cards: BoardCard[] = rfpList.map((rfp) => {
      const b = bidsByRfp.get(rfp.id) ?? [];
      const invitations = invsByRfp.get(rfp.id) ?? [];
      const stage = classifyBuyerRfp({ rfp });
      return {
        cardType: 'rfp',
        cardId: rfp.id,
        columnId: resolveCardColumn({
          boardColumnId: rfp.boardColumnId,
          lifecycleKey: stage,
          columns,
        }),
        payload: toBuyerCard({ rfp, bids: b, invitations, stage }),
      };
    });
    return { columns, cards: sortCards(cards, columns, 'rfp') };
  }

  // pipeline + pg
  const [invRepo, bidRepo] = await Promise.all([getInvitationRepo(), getBidRepo()]);
  const [pairs, bidList] = await Promise.all([
    invRepo.findByPgWorkspace(workspaceId),
    bidRepo.findByPgWs(workspaceId),
  ]);
  const bidByRfp = new Map<string, Bid>();
  for (const b of bidList) bidByRfp.set(b.rfpId, b);
  const cards: BoardCard[] = pairs.map(({ invitation, rfp }) => {
    const bid = bidByRfp.get(rfp.id);
    const stage = classifyPgInvitation({ invitation, bid, rfp });
    return {
      cardType: 'invitation',
      cardId: invitation.id,
      columnId: resolveCardColumn({
        boardColumnId: invitation.boardColumnId,
        lifecycleKey: stage,
        columns,
      }),
      payload: toPgCard({ invitation, bid, rfp, stage }),
    };
  });
  return { columns, cards: sortCards(cards, columns, 'invitation') };
}
