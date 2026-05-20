// Buyer 홈 칸반 데이터 로더 — repo 호출 + 분류 + 직렬화.
// 이 파일은 server-only — DB / repo factory 를 import 하므로 client component 에서
// import 하면 번들에 postgres 가 포함돼 빌드 깨짐. RSC 에서만 호출.
import {
  getRfpRepo,
  getBidRepo,
  getInvitationRepo,
} from './repositories/factory';
import {
  classifyBuyerRfp,
  toBuyerCard,
  compareBuyerCards,
  type BuyerKanbanCard,
} from './buyer-kanban';

export async function getBuyerKanbanData(
  workspaceId: string,
): Promise<BuyerKanbanCard[]> {
  const [rfpRepo, bidRepo, invRepo] = await Promise.all([
    getRfpRepo(),
    getBidRepo(),
    getInvitationRepo(),
  ]);
  const rfps = await rfpRepo.findByBuyerWs(workspaceId);

  // RFP 수와 무관한 상수 쿼리 — bid/invitation 을 rfpId별 Map으로 배치 fetch 후
  // 인메모리 머지(N+1 제거). pg-kanban-loader 와 동일 패턴.
  const rfpIds = rfps.map((r) => r.id);
  const [bidsByRfp, invsByRfp] = await Promise.all([
    bidRepo.findByRfpIds(rfpIds),
    invRepo.findByRfpIds(rfpIds),
  ]);
  const now = new Date();

  const cards = rfps.map((rfp) => {
    const bids = bidsByRfp.get(rfp.id) ?? [];
    const invitations = invsByRfp.get(rfp.id) ?? [];
    const stage = classifyBuyerRfp({ rfp, bids, invitations, now });
    return toBuyerCard({ rfp, bids, invitations, stage });
  });

  return cards.sort(compareBuyerCards);
}
