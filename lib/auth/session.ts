/**
 * Server-side session helpers. Use in server components, server actions,
 * and route handlers. Each `requireXxx` throws on missing/insufficient
 * session — callers are expected to either let Next render the error
 * boundary or redirect themselves.
 *
 * Edge note: this module imports `@/auth`, which transitively imports
 * postgres-js + bcryptjs. Do NOT import from `proxy.ts` or any code that
 * runs in the Edge runtime.
 */
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { isSessionVersionStale } from '@/lib/auth/session-version';
import { getDbSessionVersion } from '@/lib/auth/session-version-db';

export type AuthedSession = Session & {
  user: NonNullable<Session['user']> & { id: string };
};

export type BuyerSession = AuthedSession & {
  user: AuthedSession['user'] & {
    workspaceId: string;
    workspaceType: 'buyer';
    role: 'admin' | 'member';
  };
};

export type PgSession = AuthedSession & {
  user: AuthedSession['user'] & {
    workspaceId: string;
    workspaceType: 'pg';
    role: 'admin' | 'member';
  };
};

export async function requireSession(): Promise<AuthedSession> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('UNAUTHENTICATED');
  // Server-side revocation: a JWT whose sv claim trails users.session_version
  // (bumped on password reset / email change / deletion) is dead. The DB read
  // is a PK lookup memoized per request (React cache) — see session-version-db.
  const dbVersion = await getDbSessionVersion(session.user.id);
  if (isSessionVersionStale(session.user.sessionVersion, dbVersion)) {
    throw new Error('UNAUTHENTICATED');
  }
  return session as AuthedSession;
}

export async function requireBuyerSession(): Promise<BuyerSession> {
  const session = await requireSession();
  if (
    session.user.workspaceType !== 'buyer' ||
    !session.user.workspaceId ||
    !session.user.role
  ) {
    throw new Error('FORBIDDEN_BUYER');
  }
  return session as BuyerSession;
}

export async function requirePgSession(): Promise<PgSession> {
  const session = await requireSession();
  if (
    session.user.workspaceType !== 'pg' ||
    !session.user.workspaceId ||
    !session.user.role
  ) {
    throw new Error('FORBIDDEN_PG');
  }
  return session as PgSession;
}
