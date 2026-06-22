import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

/**
 * 선정(award)이 끝난 견적에서 **채팅을 닫아야 할 미선정 PG 워크스페이스 ID** 목록.
 *
 * 대화방 row 는 (buyerWsId, pgWsId) 페어로 여러 견적에서 공유되므로, 닫힘은 이
 * 견적 딜룸 컨텍스트에서만 파생한다(스키마 변경 없음). 승자는 절대 포함하지 않고,
 * 같은 PG 의 멀티라운드 입찰은 한 번만 센다.
 */
export function buyerClosedCounterpartyIds(rfp: RFP, bids: Bid[]): string[] {
  if (rfp.status !== 'awarded' || !rfp.awardedBidId) return [];
  const winnerWsId = bids.find((b) => b.id === rfp.awardedBidId)?.pgWsId;
  if (!winnerWsId) return [];
  return [...new Set(bids.map((b) => b.pgWsId))].filter((wsId) => wsId !== winnerWsId);
}
