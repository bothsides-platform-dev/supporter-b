/**
 * Single-workspace-type page guard. Pages that only make sense for one
 * workspace type (buyer-only `/rfp*`, pg-only `/inbox*`) repeated this guard
 * inline and inconsistently — some sent wrong-type/incomplete sessions to
 * `/login`, which the proxy bounces straight back (the redirect-loop class).
 * Centralised here so every such page shares one loop-safe decision.
 *
 * The pure `resolvePageAccess` is unit-tested; `requireBuyerPage` /
 * `requirePgPage` are the thin server wrappers pages call (auth → resolve →
 * redirect | return typed session).
 */
import { redirect } from 'next/navigation';
import { requireSession, type BuyerSession, type PgSession } from './session';
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

export async function requireBuyerPage(nextPath: string): Promise<BuyerSession> {
  const session = await requireSession().catch(() => null);
  const to = resolvePageAccess(session, 'buyer', nextPath);
  if (to) redirect(to);
  return session as BuyerSession;
}

export async function requirePgPage(nextPath: string): Promise<PgSession> {
  const session = await requireSession().catch(() => null);
  const to = resolvePageAccess(session, 'pg', nextPath);
  if (to) redirect(to);
  return session as PgSession;
}
