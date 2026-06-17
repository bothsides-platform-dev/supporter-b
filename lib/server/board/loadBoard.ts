// Unified kanban data loader — subsumes buyer-kanban-loader + pg-kanban-loader.
// server-only (imports the repo factory). A single call returns homogeneous cards
// (one cardType): pipeline+buyer → rfp, pipeline+pg → invitation.
// Card placement lives on the card row (board_column_id) — no separate placement query.
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
import { comparePgCards } from '@/lib/server/pg-kanban';
import { resolveCardColumn } from './resolveCardColumn';
import { loadPgInboxData, buildPgPipelineCards, type PgInboxData } from './pgInbox';
import type {
  BoardCard,
  BoardColumn,
  BoardData,
  CardType,
  ColumnKind,
} from '@/lib/types/column';
import type { WorkspaceType } from '@/lib/types/workspace';

export type { PgInboxData };

/**
 * prefetched 데이터(이미 로드된 PgInboxData)가 있으면 재사용해 3-쿼리를 건너뜀.
 * inbox/page.tsx 에서 행 조립과 보드 카드 조립을 동일 데이터로 공급할 때 사용.
 */
export async function loadPgPipelineBoard(
  workspaceId: string,
  prefetched?: PgInboxData,
): Promise<BoardData> {
  const colRepo = await getColumnRepo();
  const columns = await colRepo.listByBoard(workspaceId, 'pipeline');
  const pgData = prefetched ?? (await loadPgInboxData(workspaceId));
  return { columns, cards: sortCards(buildPgPipelineCards(pgData, columns), columns, 'invitation') };
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

  // pipeline + buyer
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

  // pipeline + pg — 데이터 조립은 loadPgInboxData(pgInbox.ts) 단일 출처.
  const pgData = await loadPgInboxData(workspaceId);
  return {
    columns,
    cards: sortCards(buildPgPipelineCards(pgData, columns), columns, 'invitation'),
  };
}
