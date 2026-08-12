/**
 * 테스트용 PG 워크스페이스 숨김 — 구매사(buyer) 발견·선택 표면 전용.
 *
 * 워크스페이스 이름에 아래 토큰이 (대소문자 무시) 포함되면 테스트 PG 로 보고
 * PG 피커에서 뺀다. 유일한 게이트는 `DrizzleWorkspaceRepository.search()` 한 곳이며
 * (`lib/server/repositories/drizzle/workspace.ts`), 기본값이 "숨김" 이라
 * `searchWorkspaces()` 를 쓰는 새 표면이 생겨도 자동으로 가려진다(fail-closed).
 *
 * 범위: 견적요청 위저드 3단계 PG 피커 · 발송 후 PG 추가 초대. 이미 참여 중인
 * 딜의 PG 이름 표기(딜룸·채팅·알림·이메일)는 건드리지 않는다 — 진행 중인 거래가
 * 이름을 잃으면 안 된다.
 *
 * ⚠️ 부분 문자열 매칭이라 상호에 토큰이 우연히 든 정상 PG 도 숨겨진다(오탐).
 * 수용된 트레이드오프이며, 조정하려면 TEST_PG_NAME_TOKENS 한 줄만 바꾼다.
 *
 * 이건 보안 경계가 아니라 가시성 조정이다 — 쿠키 이름을 아는 사람은 누구나 켠다.
 * 브라우저 콘솔에서 해제:
 *   document.cookie = 'support-b-show-test-pg=1; path=/'
 * 다시 숨기기:
 *   document.cookie = 'support-b-show-test-pg=; path=/; max-age=0'
 * 어느 쪽이든 새로고침해야 반영된다(서버가 쿠키를 읽어 목록을 만든다). 덕분에
 * 기본 상태에서는 테스트 PG 이름이 RSC 페이로드에도 JSON 응답에도 실리지 않는다.
 *
 * 이 모듈은 drizzle·next/headers 를 import 하지 않는 순수 상수 + 순수 함수로 둔다 —
 * 레포 레이어·RSC·route handler 어디서나 부담 없이 import 되어야 하기 때문이다.
 */

/** 해제 쿠키 이름. 값이 정확히 '1' 일 때만 열린다. */
export const SHOW_TEST_PG_COOKIE = 'support-b-show-test-pg';

/**
 * 이름 규칙 단일 출처. TS 술어(`isTestPgName`)와 SQL 조건(repo `search()` 의
 * `notIlike`)이 **둘 다** 이 배열에서 파생된다. 둘이 갈라지는지는
 * `lib/server/repositories/drizzle/__tests__/workspace.test.ts` 의 토큰 루프가 실 DB 로 잡는다.
 */
export const TEST_PG_NAME_TOKENS = ['test', '테스트'] as const;

/**
 * SQL 조건의 TS 동치물. 테스트 어서션용이며, 프로덕션 조회 경로에서 다시 거르지 않는다
 * (한 번 거른 결과를 또 거르면 어느 쪽이 실제 규칙인지 흐려진다).
 */
export function isTestPgName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEST_PG_NAME_TOKENS.some((token) => lower.includes(token.toLowerCase()));
}

/**
 * 쿠키 원값 → 해제 여부. 원값 취득은 표면마다 다르므로(RSC 는 `cookies()`,
 * route handler 는 `request.cookies`) 정책만 순수 함수로 공유한다.
 */
export function showTestPgFromCookie(raw: string | undefined): boolean {
  return raw === '1';
}
