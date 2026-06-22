import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';

/**
 * 선정(award)이 끝난 견적에서 **채팅을 닫아야 할 미선정 PG 워크스페이스 ID** 목록.
 *
 * 대화방 row 는 (buyerWsId, pgWsId) 페어로 여러 견적에서 공유되므로, 닫힘은 이
 * 견적 딜룸 컨텍스트에서만 파생한다(스키마 변경 없음). 승자는 절대 포함하지 않고,
 * 같은 PG 의 멀티라운드 입찰은 한 번만 센다.
 *
 * 범위 주의(의도적): 'awarded' 만 닫는다. 'cancelled'/'closed'(마감) 상태는
 * 대화를 닫지 않는다 — 본 기능은 "선정으로 종결된 견적"만 대상. 또한 차단은 UI
 * 한정(서버 sendMessage 게이트 없음)이라 /messages 의 크로스-RFP 뷰는 계속 열린다.
 */
export function buyerClosedCounterpartyIds(rfp: RFP, bids: Bid[]): string[] {
  if (rfp.status !== 'awarded' || !rfp.awardedBidId) return [];
  const winnerWsId = bids.find((b) => b.id === rfp.awardedBidId)?.pgWsId;
  if (!winnerWsId) return [];
  return [...new Set(bids.map((b) => b.pgWsId))].filter((wsId) => wsId !== winnerWsId);
}
