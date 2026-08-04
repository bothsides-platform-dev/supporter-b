/**
 * PG 딜룸이 견적 작성 위저드(`BidWizard`)를 실제로 렌더하는가 — **단일 출처**.
 *
 * 왜 함수로 빼는가: 이 조건을 두 곳이 알아야 한다.
 *   ① `PgDealRoomBody` — 위저드를 그릴지 말지 (if/else 사슬)
 *   ② `loadPgRfpDetail` — 위저드 전용 데이터(계약서 템플릿 목록)를 **미리 조회할지**
 *
 * 둘이 어긋나는 방향에 비대칭이 있다. 로더가 더 많이 가져오면 쿼리 한 번이 낭비될
 * 뿐이지만, **덜 가져오면 위저드가 빈 템플릿 목록으로 렌더된다** — 픽커가 조용히
 * 사라지고, 초안에 담긴 템플릿 선택은 "삭제된 템플릿"으로 오인돼 해제된다
 * (`BidWizard` 의 `restoredTemplateGone`). 성능 최적화가 데이터 손실로 번지는 경로라
 * 조건을 복제하지 않고 여기 한 곳에 둔다.
 *
 * `PgDealRoomBody.test.tsx` 의 드리프트 가드가 "이 함수 === 화면에 위저드가 있는가"를
 * 상태 조합마다 대조한다.
 */
export function pgDealRoomShowsBidWizard(state: {
  /** 구매사가 재요청(2라운드)을 열어 둔 상태. */
  hasPendingRequote: boolean;
  /** RFP 가 선정 완료(`status === 'awarded'`). */
  isAwarded: boolean;
  /** 이 PG 워크스페이스가 제출한 견적이 있다. */
  hasMyBid: boolean;
}): boolean {
  // 재요청이 최우선 — 이미 낸 견적이 있어도 "다시 쓰라"는 뜻이다. 화면의 if/else
  // 사슬도 이 분기를 맨 앞에 둔다.
  if (state.hasPendingRequote) return true;
  // 선정이 끝났거나 이미 냈으면 결과·요약 화면이 위저드를 대신한다.
  return !state.isAwarded && !state.hasMyBid;
}
