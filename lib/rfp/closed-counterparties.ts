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
 * 대화를 닫지 않는다 — 본 기능은 "선정으로 종결된 견적"만 대상. 차단은 UI
 * 한정(서버 sendMessage 게이트 없음)이다. /messages 통합 인박스의 닫힘은
 * 같은 규칙을 단일 대화 단위로 적용하는 {@link isConversationClosedAfterAward}
 * 로 파생한다(대화 목록 로더가 서버에서 계산, 승자 신원은 클라이언트로 보내지 않음).
 */
export function buyerClosedCounterpartyIds(rfp: RFP, bids: Bid[]): string[] {
  if (rfp.status !== 'awarded' || !rfp.awardedBidId) return [];
  const winnerWsId = bids.find((b) => b.id === rfp.awardedBidId)?.pgWsId;
  if (!winnerWsId) return [];
  return [...new Set(bids.map((b) => b.pgWsId))].filter((wsId) => wsId !== winnerWsId);
}

/**
 * 단일 대화(이 견적의 buyer↔pg)가 선정 종료로 닫혀야 하는지 판정.
 *
 * {@link buyerClosedCounterpartyIds} 와 같은 규칙(선정·승자 제외)이지만, /messages
 * 통합 인박스처럼 대화 하나만 다룰 때 쓰는 형태다. 호출부는 승자 bid 의 pgWsId
 * (`winnerPgWsId`)와 이 대화의 PG 측 워크스페이스 ID(`pgSideWsId`)만 넘기면 된다
 * — 구매사 뷰어면 상대 PG, PG 뷰어면 자기 워크스페이스. 데이터 불일치(승자 bid
 * 미발견 → winnerPgWsId null)는 fail-open(닫지 않음).
 */
export function isConversationClosedAfterAward(args: {
  rfpStatus: string | null;
  awardedBidId: string | null;
  winnerPgWsId: string | null;
  pgSideWsId: string;
}): boolean {
  if (args.rfpStatus !== 'awarded' || !args.awardedBidId) return false;
  if (!args.winnerPgWsId) return false;
  return args.winnerPgWsId !== args.pgSideWsId;
}
