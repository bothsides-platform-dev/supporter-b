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

/** Where an authenticated-but-incomplete session goes. NEVER `/login`. */
export const INCOMPLETE_SESSION_REDIRECT = '/logout';

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
): ShellAccessDecision {
  // Genuinely unauthenticated → /login (proxy lets unauth users stay on /login).
  if (!session?.user?.id) {
    return { kind: 'redirect', to: '/login' };
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

  // Workspace status gate — both pages live in (public) to avoid AppShell noise.
  if (active.status === 'pending') {
    return { kind: 'redirect', to: '/pending-approval' };
  }
  if (active.status === 'suspended') {
    return { kind: 'redirect', to: '/suspended' };
  }

  return { kind: 'render', active };
}
