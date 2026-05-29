// 칸반 드래그 결과 → 도메인 액션 매핑.
// 드롭 = 사용자 의도 → 매트릭스 조회 → DragAction. 매칭 없으면 'invalid' (스냅백).
// 'submit-bid'/'save-draft' 와 같은 mutation 은 v0 에서 폼 입력이 필수라 직접 트리거
// 가 불가능 — 대신 inbox 페이지로 navigate 시켜 사용자가 폼에서 제출하도록 한다.
import type { BuyerKanbanStage } from '@/lib/server/buyer-kanban';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';

export type DragAction =
  | { kind: 'cancel-rfp'; rfpId: string; title: string }
  | { kind: 'navigate-rfp-detail'; rfpId: string }
  | { kind: 'navigate-inbox'; rfpId: string }
  | { kind: 'withdraw-bid'; bidId: string; rfpId: string; title: string };

type BuyerInput = {
  role: 'buyer';
  from: BuyerKanbanStage;
  to: BuyerKanbanStage;
  rfpId: string;
  title: string;
};

type PgInput = {
  role: 'pg';
  from: PgKanbanStage;
  to: PgKanbanStage;
  rfpId: string;
  title: string;
  bidId?: string;
};

export function resolveDrag(input: BuyerInput | PgInput): DragAction | null {
  if (input.role === 'buyer') {
    return resolveBuyer(input);
  }
  return resolvePg(input);
}

function resolveBuyer(i: BuyerInput): DragAction | null {
  if (i.from === i.to) return null;

  // active → awarded: 낙찰은 PG 선택 필요 → RFP 상세(BidBoard)로 이동
  if (i.from === 'active' && i.to === 'awarded') {
    return { kind: 'navigate-rfp-detail', rfpId: i.rfpId };
  }

  // active → closed: 취소
  if (i.from === 'active' && i.to === 'closed') {
    return { kind: 'cancel-rfp', rfpId: i.rfpId, title: i.title };
  }

  return null;
}

function resolvePg(i: PgInput): DragAction | null {
  if (i.from === i.to) return null;

  // 작성 단계로 이동 — v0 는 form 이 inbox 페이지에 있어 navigate.
  if (i.from === 'received' && i.to === 'drafting') {
    return { kind: 'navigate-inbox', rfpId: i.rfpId };
  }

  // drafting → submitted: 폼 채워서 제출해야 함 — navigate.
  if (i.from === 'drafting' && i.to === 'submitted') {
    return { kind: 'navigate-inbox', rfpId: i.rfpId };
  }

  // submitted → lost: 철회.
  if (i.from === 'submitted' && i.to === 'lost' && i.bidId) {
    return { kind: 'withdraw-bid', bidId: i.bidId, rfpId: i.rfpId, title: i.title };
  }

  return null;
}
