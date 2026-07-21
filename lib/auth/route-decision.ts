/**
 * Pure routing decision used by both `proxy.ts` (Auth.js-wrapped) and unit tests.
 *
 * Keeping this free of any `next-auth` / DB imports is critical:
 * - proxy.ts runs in the Edge runtime; this module must stay edge-safe (no Node deps).
 * - tests can exercise the four redirect cases without instantiating NextAuth.
 *
 * The four cases (see Step 3 spec) are:
 *   1. unauth + `(app)/*`              → `/login?next=<encoded>`
 *   2. auth   + `(public)/*` (≠ `/logout`) → `/home`
 *   3. any    + `/invite/rfp/*`        → pass-through
 *   4. any    + `/logout`              → pass-through
 */

import { isLoopBreakEscape } from './logout-loop';
import { appOrigins, hostServes } from '../site-routing';

const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/password',
  '/invite',
  '/auth',
  '/logout',
];

// Paths that always pass through regardless of auth state.
// These are NOT subject to the "authenticated user on public page → /home" redirect.
// /admin is gated by its own JWT check in proxy.ts (not NextAuth).
// /pending-approval and /suspended are gate states reachable by logged-in users.
const ALWAYS_PASSTHROUGH_PREFIXES = [
  '/admin',
  '/pending-approval',
  '/suspended',
  // 이메일 매직링크는 인증 상태와 무관하게 항상 접근 가능해야 함. email-change 는 특히
  // 로그인 상태에서 클릭되는 게 정상 경로다(설정 화면에서 본인이 요청 → 새 주소로 받은
  // 링크를 같은 브라우저에서 연다) — 여기 없으면 /auth 공개 프리픽스에 걸려 /home 으로
  // 튕기고 확인 액션이 아예 실행되지 않아 변경이 조용히 완료되지 않는다.
  '/auth/verify',
  '/auth/email-change',
  '/pg-landing', // PG 호스트 "/" 의 rewrite 대상 — 직접 접근도 항상 공개
];

const CLAIMABLE_PUBLIC_PREFIXES = ['/invite/rfp'];

// Paths that guests (unauthenticated) may access even though they live outside
// the (public) route group. Authenticated users pass through too.
// (확장점: 게스트 허용이 필요한 경로를 추가할 경우 여기에 넣는다.)
const GUEST_ACCESSIBLE_PATHS: string[] = [];

export type RouteDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: string }
  | { kind: 'rewrite'; to: string };

export type ProxyDecision = RouteDecision | { kind: 'escape' };

export function decideRoute(
  pathname: string,
  search: string,
  isAuthenticated: boolean,
  host: string | null = null,
): RouteDecision {
  if (pathname === '/') {
    // partner 호스트(PG)는 정적으로 미리 빌드된 /pg-landing 을 내부적으로 서빙한다
    // (URL은 "/" 그대로). buyer 호스트/단일 호스트(local·dev)는 그대로 통과.
    if (hostServes(host, appOrigins()) === 'pg') {
      return { kind: 'rewrite', to: '/pg-landing' };
    }
    return { kind: 'next' };
  }

  if (ALWAYS_PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { kind: 'next' };
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isClaimableInvite = CLAIMABLE_PUBLIC_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );

  if (isPublic) {
    if (isClaimableInvite) return { kind: 'next' };
    if (isAuthenticated && pathname !== '/logout') {
      return { kind: 'redirect', to: '/home' };
    }
    return { kind: 'next' };
  }

  if (!isAuthenticated) {
    if (GUEST_ACCESSIBLE_PATHS.includes(pathname)) return { kind: 'next' };
    const next = encodeURIComponent(pathname + search);
    return { kind: 'redirect', to: `/login?next=${next}` };
  }

  return { kind: 'next' };
}

/**
 * proxy.ts 가 쓰는 결정 — 루프 회로차단기 탈출이 평소 라우팅보다 **우선**한다.
 * `/logout` 회로차단기가 트립해 `__rl_break` 플래그가 세워진 채 `/login` 에 오면,
 * authed 라도 `/home` 으로 되튕기지 않고 `escape`(렌더)한다. 그 외엔 `decideRoute`
 * 에 위임한다. 이 우선순위를 순수 함수로 고정해 루프 회귀를 테스트로 막는다.
 */
export function decideProxyRoute(
  pathname: string,
  search: string,
  isAuthenticated: boolean,
  breakFlag: string | undefined | null,
  host: string | null = null,
): ProxyDecision {
  if (isLoopBreakEscape(pathname, breakFlag)) return { kind: 'escape' };
  return decideRoute(pathname, search, isAuthenticated, host);
}
