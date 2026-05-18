// PG 홈 칸반 — 초대받은 RFP 1건 = 카드 1장. 6개 컬럼.
// 분류는 (invitation, optional bid, parent rfp) 트리플로부터 결정. 결과 단계(낙찰/실패)
// 가 bid 단계보다 우선 — RFP 가 awarded/closed 면 즉시 결과 컬럼으로 들어감.
//
// 이 파일은 client component 에서도 import 가능 — repo / DB import 없이 순수 도메인.
// 데이터 로더는 ./pg-kanban-loader.ts 참조.
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';

export type PgKanbanStage =
  | 'received'
  | 'reviewing'
  | 'drafting'
  | 'submitted'
  | 'won'
  | 'lost';

export const PG_KANBAN_ORDER: readonly PgKanbanStage[] = [
  'received',
  'reviewing',
  'drafting',
  'submitted',
  'won',
  'lost',
] as const;

export const PG_KANBAN_LABEL: Record<PgKanbanStage, string> = {
  received: '수신',
  reviewing: '검토중',
  drafting: '작성중',
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

// pure — 단위 테스트 가능.
export function classifyPgInvitation(args: {
  invitation: RfpInvitation;
  bid?: Bid;
  rfp: RFP;
}): PgKanbanStage {
  const { invitation, bid, rfp } = args;

  // 결과 단계는 bid 단계보다 우선.
  if (rfp.status === 'awarded') {
    return bid && rfp.awardedBidId === bid.id ? 'won' : 'lost';
  }
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'lost';

  // bid 단계.
  if (bid?.status === 'withdrawn') return 'lost';
  if (bid?.status === 'submitted') return 'submitted';
  if (bid?.status === 'draft') return 'drafting';

  // bid 가 아직 없음 — invitation 상태로 판정.
  // findByPgWorkspace 는 sent/opened/accepted 를 반환. sent → received, opened → reviewing.
  if (invitation.status === 'opened') return 'reviewing';
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
    rfpId: rfp.id,
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
