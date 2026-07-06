// PG 데모 창(4페이지)과 참여 프로세스(5스텝)를 잇는 매핑.
// 창 위 싱크 카드가 보여줄 스텝(0-index)을 현재 데모 페이지에서 결정한다.
//   홈(1)      → ① 파트너 등록(0)
//   받은요청(2) → ② RFP 수신(1)
//   딜룸(3)     → ③ 제안 제출(2)
//   메시지(4)   → ⑤ 계약 논의(4)  — ④ 고객사 검토(3)는 PG 화면이 없어 카드로는 건너뛴다.
// 스테퍼 노드 상태는 이 active index 기준으로 파생한다(i<active=완료, i===active=현재).
const PAGE_TO_STEP: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 4 };

export function pgDemoPageToStepIndex(page: number): number {
  return PAGE_TO_STEP[page] ?? 0;
}
