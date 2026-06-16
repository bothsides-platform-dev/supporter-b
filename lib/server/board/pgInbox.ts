// PG 인박스 공유 데이터 로더 + 순수 빌더
//
// 3-쿼리 조립(pairs/bidByRfp/pendingRequoteRfpIds)의 단일 출처.
// inbox/page.tsx 의 InboxRow[] 빌더와 loadBoard.ts 의 BoardCard[] 빌더가 동일한
// 데이터를 한 줄 단위로 중복하므로, 이 파일로 추출해 양쪽이 소비한다.
//
// pure 함수(pgInboxDataToRows · buildPgPipelineCards)는 DB import 없음 —
// repo-boundary ESLint 규칙 준수 + 단위 테스트 가능.
import {
  getInvitationRepo,
  getBidRepo,
  getRfpRequoteRequestRepo,
} from '@/lib/server/repositories/factory';
import { classifyPgInvitation, toPgCard } from '@/lib/server/pg-kanban';
import { resolveCardColumn } from './resolveCardColumn';
import { GRADE_LABELS } from '@/lib/types/biz-profile';
import type { PgInvitationPair } from '@/lib/server/repositories/types';
import type { Bid } from '@/lib/types/bid';
import type { BoardCard, BoardColumn } from '@/lib/types/column';
import type { InboxRow } from '@/components/inbox/InboxList';

export type PgInboxData = {
  pairs: PgInvitationPair[];
  /** rfpId(uuid) → Bid. 재사용 편의를 위해 이미 빌드된 Map. */
  bidByRfp: Map<string, Bid>;
  pendingRequoteRfpIds: Set<string>;
};

// ── 데이터 로더 (async, repo 경유) ──────────────────────────────────────────

/** PG 인박스에 필요한 3-쿼리 데이터를 병렬 로드하고 Map/Set 으로 조립해 반환. */
export async function loadPgInboxData(workspaceId: string): Promise<PgInboxData> {
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
  return { pairs, bidByRfp, pendingRequoteRfpIds };
}

// ── 순수 빌더 ────────────────────────────────────────────────────────────────

/**
 * PgInboxData → InboxRow[] (인박스 테이블 행)
 *
 * - received 단계는 bidId 를 생략(링크 미노출 규칙).
 * - rfpId = rfp.code (URL/표시용 — uuid 아님).
 * - grade 는 GRADE_LABELS 로 변환; bizProfile 없으면 '—'.
 */
export function pgInboxDataToRows(data: PgInboxData): InboxRow[] {
  return data.pairs.map(({ invitation, rfp }) => {
    const bid = data.bidByRfp.get(rfp.id);
    const stage = classifyPgInvitation({ invitation, bid, rfp });
    return {
      invitationId: invitation.id,
      stage,
      // received(미제출) 단계는 "보낸 견적" 링크를 노출하지 않도록 bidId 생략.
      bidId: stage === 'received' ? undefined : bid?.id,
      rfpId: rfp.code,
      rfpTitle: rfp.title,
      rfpDeadline: rfp.deadline,
      grade: rfp.bizProfile?.grade ? GRADE_LABELS[rfp.bizProfile.grade] : '—',
      gradeRaw: rfp.bizProfile?.grade,
      contractType: rfp.contractType ?? null,
      isSample: rfp.isSample ?? false,
      hasPendingRequote: data.pendingRequoteRfpIds.has(rfp.id),
    };
  });
}

/**
 * PgInboxData + 컬럼 목록 → BoardCard[] (PG 파이프라인 보드 카드)
 *
 * - cardId = invitation.id (칸반 카드 uuid).
 * - columnId 는 invitation.boardColumnId → lifecycleKey → 시스템 첫 컬럼 순으로 해소.
 * - payload 는 toPgCard (PgKanbanCard).
 */
export function buildPgPipelineCards(data: PgInboxData, columns: BoardColumn[]): BoardCard[] {
  return data.pairs.map(({ invitation, rfp, buyerName }) => {
    const bid = data.bidByRfp.get(rfp.id);
    const stage = classifyPgInvitation({ invitation, bid, rfp });
    return {
      cardType: 'invitation' as const,
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
        hasPendingRequote: data.pendingRequoteRfpIds.has(rfp.id),
      }),
    };
  });
}
