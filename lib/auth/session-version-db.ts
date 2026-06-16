/**
 * DB read for JWT revocation (see session-version.ts for the pure decision).
 *
 * `fetchSessionVersion` is dependency-injected for tests (PGlite), mirroring
 * `authorizeCredentials`. `getDbSessionVersion` binds the app client and
 * memoizes per request via React cache() — requireSession() and the (app)
 * shell guard both call it in one request without a duplicate query.
 *
 * Node-only (imports the postgres-js client) — do NOT import from proxy.ts or
 * other edge code.
 */
import { cache } from 'react';
import { eq } from 'drizzle-orm';

import { users } from '@/lib/db/schema';

export async function fetchSessionVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.sessionVersion ?? null;
}

export const getDbSessionVersion = cache(async (userId: string): Promise<number | null> => {
  const { db } = await import('@/lib/db/client');
  return fetchSessionVersion(db, userId);
});

export async function fetchEmailVerified(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<boolean | null> {
  const [row] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.emailVerified ?? null;
}

export const getDbEmailVerified = cache(async (userId: string): Promise<boolean | null> => {
  const { db } = await import('@/lib/db/client');
  return fetchEmailVerified(db, userId);
});
