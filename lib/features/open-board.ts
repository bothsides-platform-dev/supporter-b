/**
 * 오픈게시판(PG 발견 보드) 임시 kill switch.
 *
 * 다시 켜려면 이 값만 `true` 로 바꿔 배포하세요 — 다른 파일은 손대지 않습니다.
 * UI-only 차단이라 서버 액션·데이터는 그대로 → 켜는 즉시 그동안 만든 RFP 도
 * 자연스럽게 노출됩니다.
 *
 * 새 노출 surface 를 추가할 때 이 플래그를 반드시 참조하세요. 누락은
 * `lib/features/__tests__/open-board-flag.test.ts` 드리프트 가드가 잡습니다.
 *
 * 타입을 `boolean` 으로 명시한 건 의도적입니다 — `false` 리터럴로 좁혀지면
 * `if (OPEN_BOARD_ENABLED)` 분기가 dead-code 로 취급돼 lint 에 걸립니다.
 */
export const OPEN_BOARD_ENABLED: boolean = false;
