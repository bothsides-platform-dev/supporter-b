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
  '/auth/verify', // 이메일 매직링크는 인증 상태와 무관하게 항상 접근 가능해야 함
];

const CLAIMABLE_PUBLIC_PREFIXES = ['/invite/rfp'];

// Paths that guests (unauthenticated) may access even though they live outside
// the (public) route group. Authenticated users pass through too.
// (확장점: 게스트 허용이 필요한 경로를 추가할 경우 여기에 넣는다.)
const GUEST_ACCESSIBLE_PATHS: string[] = [];

export type RouteDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: string };

export function decideRoute(
  pathname: string,
  search: string,
  isAuthenticated: boolean,
): RouteDecision {
  if (pathname === '/') {
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
