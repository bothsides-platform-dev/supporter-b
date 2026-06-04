// Buyer 홈 칸반 — RFP 1건 = 카드 1장. 4개 컬럼.
// 분류는 `RFP.status` 로 도출되는 derived 값.
// 사용자가 임의로 컬럼을 옮기는 건 plan 의 드래그 매트릭스가 허락하는 전이만 가능 (각각이
// 도메인 액션을 트리거 — sendDraftInvitationsAction / awardRfpAction / cancelRfpAction).
//
// 이 파일은 client component 에서도 import 가능 — repo / DB import 없이 순수 도메인.
// 데이터 로더는 ./buyer-kanban-loader.ts 참조.
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { RfpInvitation } from '@/lib/types/invitation';

export type BuyerKanbanStage = 'active' | 'awarded' | 'closed';

export const BUYER_KANBAN_ORDER: readonly BuyerKanbanStage[] = [
  'active',
  'awarded',
  'closed',
] as const;

export const BUYER_KANBAN_LABEL: Record<BuyerKanbanStage, string> = {
  active: '진행중',
  awarded: '선정 완료',
  closed: '마감',
};

export type BuyerKanbanCard = {
  rfpId: string;
  title: string;
  stage: BuyerKanbanStage;
  deadline: string;
  createdAt: string;
  invitedPgCount: number;
  submittedBidCount: number;
  awardedBidId?: string;
};

// pure — 단위 테스트 가능. status 만으로 3단계 분류 (진행중/마감/계약완료).
// draft(작성중)는 보드 단계에서 제거됐다 — draft RFP 는 loadBoard 에서 카드로 만들어지기
// 전에 걸러지므로, 방어적으로 여기 도달하면 'active' 로 폴백한다(실사용 경로 아님).
export function classifyBuyerRfp(args: { rfp: RFP }): BuyerKanbanStage {
  const { rfp } = args;
  if (rfp.status === 'awarded') return 'awarded';
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'closed';
  return 'active'; // status === 'sent'
}

export function toBuyerCard(args: {
  rfp: RFP;
  bids: Bid[];
  invitations: RfpInvitation[];
  stage: BuyerKanbanStage;
}): BuyerKanbanCard {
  const { rfp, bids, invitations, stage } = args;
  // 카드의 'invited PG 수' 는 도메인적으로 '실제 발송 대상'을 의미해야 함 — draft 는 제외.
  const invitedActive = invitations.filter((i) => i.status !== 'draft').length;
  return {
    // 카드 식별자는 URL/표시용 code (홈 칸반 → /rfp/[code]).
    rfpId: rfp.code,
    title: rfp.title,
    stage,
    deadline: rfp.deadline,
    createdAt: rfp.createdAt,
    invitedPgCount: invitedActive,
    submittedBidCount: bids.filter((b) => b.status === 'submitted').length,
    awardedBidId: rfp.awardedBidId,
  };
}

// 컬럼 내 정렬 — 진행 중 컬럼은 deadline 오름차순(가장 임박한 게 위), 결과 컬럼은 최신 순.
export function compareBuyerCards(
  a: BuyerKanbanCard,
  b: BuyerKanbanCard,
): number {
  if (a.stage === 'awarded' || a.stage === 'closed') {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}
