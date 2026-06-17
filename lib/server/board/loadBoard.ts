// Unified kanban data loader — server-only (imports the repo factory). A single
// call returns homogeneous cards (one cardType): pipeline+buyer → rfp,
// pipeline+pg → invitation. Card placement lives on the card row
// (board_column_id) — no separate placement query.
import {
  getColumnRepo,
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
  getRfpRequoteRequestRepo,
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
import type {
  BoardCard,
  BoardColumn,
  BoardData,
  CardType,
  ColumnKind,
} from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';
import type { Bid } from '@/lib/types/bid';

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
}): Promise<BoardData> {
  const { workspaceId, workspaceType, kind } = args;
  const colRepo = await getColumnRepo();
  const columns = await colRepo.listByBoard(workspaceId, kind);

  // pipeline
  if (workspaceType === 'buyer') {
    const [rfpRepo, bidRepo, invRepo] = await Promise.all([
      getRfpRepo(),
      getBidRepo(),
      getInvitationRepo(),
    ]);
    // draft(작성중) RFP 는 보드 단계에서 제거됨 — 발송 전 초안은 파이프라인에 노출하지
    // 않는다(테이블/?status=draft 로만 접근). 제거된 작성중 컬럼으로의 폴백을 방지.
    const rfpList = (await rfpRepo.findByBuyerWs(workspaceId)).filter(
      (r) => r.status !== 'draft',
    );
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
  const [invRepo, bidRepo, requoteRepo] = await Promise.all([
    getInvitationRepo(),
    getBidRepo(),
    getRfpRequoteRequestRepo(),
  ]);
  const [pairs, bidList, pendingRequotes] = await Promise.all([
    invRepo.findByPgWorkspace(workspaceId),
    bidRepo.findByPgWs(workspaceId),
    requoteRepo.findPendingByPgWs(workspaceId),
  ]);
  const bidByRfp = new Map<string, Bid>();
  for (const b of bidList) bidByRfp.set(b.rfpId, b);
  const pendingRequoteRfpIds = new Set(pendingRequotes.map((r) => r.rfpId));
  const cards: BoardCard[] = pairs.map(({ invitation, rfp, buyerName }) => {
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
      payload: toPgCard({
        invitation,
        bid,
        rfp,
        stage,
        buyerName,
        hasPendingRequote: pendingRequoteRfpIds.has(rfp.id),
      }),
    };
  });
  return { columns, cards: sortCards(cards, columns, 'invitation') };
}
