// Buyer 홈 칸반 — RFP 1건 = 카드 1장. 6개 컬럼.
// 분류는 `RFP.status` + 응답 상태(submitted bid 수) + deadline 으로 도출되는 derived 값.
// 사용자가 임의로 컬럼을 옮기는 건 plan 의 드래그 매트릭스가 허락하는 전이만 가능 (각각이
// 도메인 액션을 트리거 — sendDraftInvitationsAction / awardRfpAction / cancelRfpAction).
//
// 이 파일은 client component 에서도 import 가능 — repo / DB import 없이 순수 도메인.
// 데이터 로더는 ./buyer-kanban-loader.ts 참조.
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { RfpInvitation } from '@/lib/types/invitation';

export type BuyerKanbanStage =
  | 'draft'
  | 'sent'
  | 'collecting'
  | 'comparing'
  | 'awarded'
  | 'closed';

export const BUYER_KANBAN_ORDER: readonly BuyerKanbanStage[] = [
  'draft',
  'sent',
  'collecting',
  'comparing',
  'awarded',
  'closed',
] as const;

export const BUYER_KANBAN_LABEL: Record<BuyerKanbanStage, string> = {
  draft: '작성중',
  sent: '발송',
  collecting: '응답수집',
  comparing: '비교·협상중',
  awarded: '낙찰',
  closed: '종료',
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

// pure — 단위 테스트 가능.
export function classifyBuyerRfp(args: {
  rfp: RFP;
  bids: Bid[];
  invitations: RfpInvitation[];
  now: Date;
}): BuyerKanbanStage {
  const { rfp, bids, invitations, now } = args;

  if (rfp.status === 'awarded') return 'awarded';
  if (rfp.status === 'closed' || rfp.status === 'cancelled') return 'closed';
  if (rfp.status === 'draft') return 'draft';

  // status === 'sent'
  // PG 의 draft bid 는 buyer 에게 보이지 않는 WIP — '응답수집' 판정에서 제외.
  const submittedBids = bids.filter((b) => b.status === 'submitted');
  if (submittedBids.length === 0) return 'sent';

  const deadlinePassed = new Date(rfp.deadline).getTime() <= now.getTime();
  if (deadlinePassed) return 'comparing';

  // 초대된 PG 가 모두 응답을 제출했으면 더 받을 게 없으니 '비교·협상' 으로.
  // 'draft'/'expired'/'declined' 상태 invitation 은 발송이 안 됐거나 무효화 — 모수에서 제외.
  const invitedActive = invitations.filter(
    (i) =>
      i.status === 'sent' || i.status === 'opened' || i.status === 'accepted',
  ).length;
  if (invitedActive > 0 && submittedBids.length >= invitedActive) {
    return 'comparing';
  }

  return 'collecting';
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
  if (a.stage === 'draft' || b.stage === 'draft') {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  if (a.stage === 'awarded' || a.stage === 'closed') {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}
