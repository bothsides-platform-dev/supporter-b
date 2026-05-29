/**
 * Pure single-workspace-type page guard decision. Kept free of `@/auth` /
 * `next/navigation` imports (those break unit-node tests and the edge runtime) —
 * the effectful wrappers live in `page-guards.ts`.
 *
 * Pages that only make sense for one workspace type (buyer-only `/rfp*`, pg-only
 * `/inbox*`) repeated this guard inline and inconsistently — some sent
 * wrong-type/incomplete sessions to `/login`, which the proxy bounces straight
 * back (the redirect-loop class). Centralised here so every such page shares one
 * loop-safe decision.
 */
import { INCOMPLETE_SESSION_REDIRECT } from './shell-access';

type PageSession = {
  user?: {
    id?: string;
    workspaceId?: string;
    workspaceType?: 'buyer' | 'pg';
  };
} | null;

/**
 * Where a request for a `requiredType` page should go, or `null` to allow it.
 *   - unauthenticated         → /login?next=<path>
 *   - authed, no ws claim     → /logout   (loop-safe; never /login)
 *   - authed, wrong ws type   → /home     (neutral landing; never /login)
 *   - authed, correct type    → null      (render)
 */
export function resolvePageAccess(
  session: PageSession,
  requiredType: 'buyer' | 'pg',
  nextPath: string,
): string | null {
  if (!session?.user?.id) {
    return `/login?next=${nextPath}`;
  }
  if (!session.user.workspaceId || !session.user.workspaceType) {
    return INCOMPLETE_SESSION_REDIRECT;
  }
  if (session.user.workspaceType !== requiredType) {
    return '/home';
  }
  return null;
}
