// PG 홈 칸반 — 초대받은 RFP 1건 = 카드 1장. 4개 컬럼.
// 분류는 (invitation, optional bid, parent rfp) 트리플로부터 결정. 결과 단계(낙찰/실패)
// 가 bid 단계보다 우선 — RFP 가 awarded/closed 면 즉시 결과 컬럼으로 들어감.
// 제출 전(bid 없음 / bid=draft)은 모두 신규(received) — 작성중 단계 제거.
//
// 이 파일은 client component 에서도 import 가능 — repo / DB import 없이 순수 도메인.
// 데이터 로더는 ./pg-kanban-loader.ts 참조.
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';

export type PgKanbanStage = 'received' | 'submitted' | 'won' | 'lost';

export const PG_KANBAN_ORDER: readonly PgKanbanStage[] = [
  'received',
  'submitted',
  'won',
  'lost',
] as const;

export const PG_KANBAN_LABEL: Record<PgKanbanStage, string> = {
  received: '신규',
  submitted: '제출완료',
  won: '낙찰',
  lost: '실패',
};

export type PgKanbanCard = {
  invitationId: string;
  rfpId: string;
  title: string;
  stage: PgKanbanStage;
  deadline: string;
  bizGradeLabel?: string;
  bidId?: string;
  submittedAt?: string;
};

// pure — 단위 테스트 가능. 검토중(reviewing) 제거 — 열람 여부와 무관하게 신규(received).
export function classifyPgInvitation(args: {
  invitation: RfpInvitation;
  bid?: Bid;
  rfp: RFP;
}): PgKanbanStage {
  const { bid, rfp } = args;

  // 결과 단계는 bid 단계보다 우선.
  if (rfp.status === 'awarded') {
    return bid && rfp.awardedBidId === bid.id ? 'won' : 'lost';
  }
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'lost';

  if (bid?.status === 'withdrawn') return 'lost';
  if (bid?.status === 'submitted') return 'submitted';

  // 제출 전(bid 없음 / bid=draft) + sent/opened — 모두 신규(received).
  return 'received';
}

const GRADE_LABEL: Record<string, string> = {
  small: '영세',
  sme1: '중소1',
  sme2: '중소2',
  sme3: '중소3',
  general: '일반',
};

export function toPgCard(args: {
  invitation: RfpInvitation;
  bid?: Bid;
  rfp: RFP;
  stage: PgKanbanStage;
}): PgKanbanCard {
  const { invitation, bid, rfp, stage } = args;
  const grade = rfp.bizProfile?.grade;
  return {
    invitationId: invitation.id,
    // 카드 식별자는 URL/표시용 code (PG 칸반 → /inbox/[code]).
    rfpId: rfp.code,
    title: rfp.title,
    stage,
    deadline: rfp.deadline,
    bizGradeLabel: grade ? GRADE_LABEL[grade] : undefined,
    bidId: bid?.id,
    submittedAt: bid?.submittedAt,
  };
}

export function comparePgCards(a: PgKanbanCard, b: PgKanbanCard): number {
  if (a.stage === 'won' || a.stage === 'lost') {
    const ta = a.submittedAt ?? a.deadline;
    const tb = b.submittedAt ?? b.deadline;
    return new Date(tb).getTime() - new Date(ta).getTime();
  }
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}
