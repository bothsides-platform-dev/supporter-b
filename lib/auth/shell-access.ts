/**
 * Pure (app)-shell auth guard decision, used by `app/(app)/layout.tsx` and unit
 * tests. Keeping the decision free of `next-auth` / DB / `next/navigation`
 * imports lets tests exercise every redirect branch without rendering the RSC.
 *
 * ── REDIRECT-LOOP CONTRACT (load-bearing — do not "simplify" to /login) ──────
 * proxy.ts (the Auth.js-wrapped middleware) treats ANY session-user as
 * authenticated and bounces them off `/login` back to `/home` (see
 * lib/auth/route-decision.ts → decideRoute, the `/public → /home` branch). So an
 * authenticated-but-incomplete session (valid JWT, but no workspace claim, or no
 * live DB membership) MUST be sent to `/logout`, never `/login` — `/login` would
 * bounce straight back to `/home`, which re-enters this guard, forever
 * (ERR_TOO_MANY_REDIRECTS). proxy.ts deliberately lets `/logout` pass through.
 * That coupling is why this single constant exists and is shared across the two
 * incomplete-session branches below.
 */
import type { WorkspaceMembershipSummary } from '@/lib/types/workspace';
import { isSessionVersionStale } from '@/lib/auth/session-version';

/** Where an authenticated-but-incomplete session goes. NEVER `/login`. */
export const INCOMPLETE_SESSION_REDIRECT = '/logout';

/** JWT `sv` claim vs. current users.session_version — see session-version.ts. */
export type SessionVersionPair = {
  token: number | undefined;
  db: number | null | undefined;
};

type ShellSession = {
  user?: {
    id?: string;
    workspaceId?: string;
    workspaceType?: 'buyer' | 'pg';
  };
} | null;

export type ShellAccessDecision =
  | { kind: 'redirect'; to: string }
  | { kind: 'render'; active: WorkspaceMembershipSummary };

export function resolveShellAccess(
  session: ShellSession,
  workspaces: WorkspaceMembershipSummary[],
  sessionVersions?: SessionVersionPair,
  emailVerified?: boolean,
): ShellAccessDecision {
  // Genuinely unauthenticated → /login (proxy lets unauth users stay on /login).
  if (!session?.user?.id) {
    return { kind: 'redirect', to: '/login' };
  }

  // Revoked session (sv claim trails users.session_version — bumped on password
  // reset / email change / deletion) → /logout, NOT /login (loop contract above).
  if (
    sessionVersions &&
    isSessionVersionStale(sessionVersions.token, sessionVersions.db)
  ) {
    return { kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT };
  }

  // Authenticated JWT but no workspace claim → /logout, NOT /login (see contract).
  if (!session.user.workspaceId || !session.user.workspaceType) {
    return { kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT };
  }

  // Authenticated JWT but DB shows no live membership → /logout (same reason).
  if (workspaces.length === 0) {
    return { kind: 'redirect', to: INCOMPLETE_SESSION_REDIRECT };
  }

  // Active = the JWT's workspace if still a member, else fall back to the first
  // (render-only; the token reconciles on the next explicit switch).
  const active =
    workspaces.find((w) => w.id === session.user!.workspaceId) ?? workspaces[0];

  // Email-verification gate — a 1st-class gate INDEPENDENT of workspace approval
  // status. /pending-approval renders the email-verify screen whenever
  // emailVerified is false (regardless of ws status), so an unverified user whose
  // active workspace is already `active` (e.g. canonical-PG join, which bypasses
  // the pending status gate below) is still forced to verify. `=== false` only:
  // `undefined` (caller didn't supply it) fails open so legacy callers/tests are
  // unaffected. No loop: /pending-approval lives in (public), not behind this guard.
  if (emailVerified === false) {
    return { kind: 'redirect', to: '/pending-approval' };
  }

  // Membership-level approval gate — joinCanonicalPgWorkspace 로 합류한 PG 담당자
  // 계정이 admin 승인을 받을 때까지 앱 진입을 차단한다.
  // email 인증 게이트(위)가 먼저 평가되므로, 여기 도달하면 이메일은 인증된 상태.
  if (active.memberApprovalStatus === 'pending_approval') {
    return { kind: 'redirect', to: '/pending-approval' };
  }
  if (active.memberApprovalStatus === 'rejected') {
    return { kind: 'redirect', to: '/pending-approval' };
  }

  // Workspace status gate — both pages live in (public) to avoid AppShell noise.
  if (active.status === 'pending') {
    return { kind: 'redirect', to: '/pending-approval' };
  }
  if (active.status === 'suspended') {
    return { kind: 'redirect', to: '/suspended' };
  }

  return { kind: 'render', active };
}
