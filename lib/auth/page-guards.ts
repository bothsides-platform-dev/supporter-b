/**
 * Effectful page guards — the server wrappers buyer/pg-only pages call:
 * auth() → resolvePageAccess → redirect | return typed session. The decision
 * itself is the pure, unit-tested `resolvePageAccess`.
 *
 * Edge note: imports `@/auth` (postgres-js + bcryptjs). Server components /
 * actions only — never from `proxy.ts` or edge code.
 */
import { redirect } from 'next/navigation';
import { requireSession, type BuyerSession, type PgSession } from './session';
import { resolvePageAccess } from './page-access';

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
