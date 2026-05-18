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
  const now = new Date();

  // 워크스페이스 별 RFP 수가 많지 않은 v0 가정 — RFP 당 bid/invitation 병렬 fetch.
  // 추후 N+1 가 문제되면 batch 메서드 추가.
  const cards = await Promise.all(
    rfps.map(async (rfp) => {
      const [bids, invitations] = await Promise.all([
        bidRepo.findByRfp(rfp.id),
        invRepo.findByRfp(rfp.id),
      ]);
      const stage = classifyBuyerRfp({ rfp, bids, invitations, now });
      return toBuyerCard({ rfp, bids, invitations, stage });
    }),
  );

  return cards.sort(compareBuyerCards);
}
