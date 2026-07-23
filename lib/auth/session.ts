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
import {
  getDbEmailVerified,
  getDbMemberApprovalStatus,
  getDbSessionVersion,
} from '@/lib/auth/session-version-db';

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

/**
 * Server-side revocation: a JWT whose sv claim trails users.session_version
 * (bumped on password reset / email change / deletion) is dead. The DB read
 * is a PK lookup memoized per request (React cache) — see session-version-db.
 *
 * API routes that call `auth()` directly (instead of requireXxx) MUST run this
 * after their unauthenticated check, or revoked tokens keep working there
 * until JWT expiry. Unauthenticated sessions return false — the route's own
 * 401 guard handles those.
 */
export async function isSessionRevoked(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;
  const dbVersion = await getDbSessionVersion(session.user.id);
  return isSessionVersionStale(session.user.sessionVersion, dbVersion);
}

export async function isEmailUnverified(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return true;
  return !(await getDbEmailVerified(session.user.id));
}

export async function requireSession(): Promise<AuthedSession> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('UNAUTHENTICATED');
  if (await isSessionRevoked(session)) throw new Error('UNAUTHENTICATED');
  if (await isEmailUnverified(session)) throw new Error('EMAIL_UNVERIFIED');
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
  // Membership approval gate — joinCanonicalPgWorkspace creates members with
  // approval_status='pending_approval' whose JWT is otherwise fully valid
  // (workspaceType 'pg', role 'admin'). The shell guard only covers page loads;
  // this is the data boundary for server actions / API routes. Read live from
  // the DB (the JWT has no approval claim) and fail closed: anything but
  // 'approved' — including an absent row — is rejected. PG-only on purpose:
  // no buyer flow writes a non-approved status.
  const approval = await getDbMemberApprovalStatus(
    session.user.id,
    session.user.workspaceId,
  );
  if (approval !== 'approved') {
    throw new Error('FORBIDDEN_PG');
  }
  return session as PgSession;
}
