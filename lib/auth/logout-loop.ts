/**
 * 인증 리다이렉트 루프 회로차단기 — 순수 결정 로직.
 *
 * stale 세션 쿠키가 클리어되지 않으면 `/home → /logout → /login → /home` 사이클이
 * 무한 반복된다. 이 사이클의 단일 통과점은 `/logout` GET 진입이므로, 그 진입 횟수를
 * `__rl` 쿠키로 세어 임계치(THRESHOLD)에 도달하면 회로를 끊는다(공격적 클리어 +
 * 탈출 플래그). 쿠키 I/O 없이 순수 함수로 두어 단위 테스트로 검증한다.
 *
 * proxy.ts(Edge)와 logout route(Node) 양쪽에서 쓰일 수 있어 import-free 로 유지한다.
 */

/** `/logout` GET 진입 횟수 카운터 쿠키 이름. */
export const RL_COOKIE = '__rl';
/** 회로차단기가 트립됐음을 proxy 에 알리는 탈출 플래그 쿠키 이름. */
export const RL_BREAK = '__rl_break';
/**
 * 강제 로그아웃 사이클 임계치. 정상 로그아웃은 1 사이클이면 끝나므로, 이만큼
 * 반복되면 루프로 간주한다.
 */
export const RL_THRESHOLD = 3;

export type ForcedLogoutPlan =
  | { kind: 'normal'; nextCount: number }
  | { kind: 'break' };

/** Cookie 헤더에서 `__rl` 값을 읽어 정수로 반환한다. 부재·비정상·음수 → 0. */
export function parseRlCount(cookieHeader: string | null | undefined): number {
  if (!cookieHeader) return 0;
  for (const part of cookieHeader.split(';')) {
    const [name, value] = part.split('=');
    if (name?.trim() === RL_COOKIE) {
      const n = Number.parseInt((value ?? '').trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

/**
 * 현재 카운터로 강제 로그아웃 계획을 결정한다.
 * - count < THRESHOLD → normal(카운터 +1, 평소 클리어).
 * - count >= THRESHOLD → break(공격적 클리어 + 탈출 플래그, 카운터 증가 없음).
 */
export function planForcedLogout(currentCount: number): ForcedLogoutPlan {
  if (currentCount >= RL_THRESHOLD) return { kind: 'break' };
  return { kind: 'normal', nextCount: currentCount + 1 };
}

/**
 * proxy 탈출 렌더 판정: 회로차단기가 트립해 `__rl_break` 플래그가 세워진 채 `/login`
 * 에 도달하면, 평소의 `authed→/home` 바운스를 억제하고 `/login` 을 실제로 렌더해야
 * 한다(쿠키 클리어가 끝내 실패해도 유저가 로그인 화면을 보고 재로그인으로 복구).
 * `/login` 공개 라우트에만 적용 — 보호 라우트는 통과시키지 않으므로 fail-open 아님.
 */
export function isLoopBreakEscape(
  pathname: string,
  breakFlag: string | undefined | null,
): boolean {
  return Boolean(breakFlag) && pathname.startsWith('/login');
}
