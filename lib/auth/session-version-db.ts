/**
 * DB read for JWT revocation (see session-version.ts for the pure decision).
 *
 * Reads go through the repository factory (`getUserRepo()`) which binds the app
 * client; `getDbSessionVersion` memoizes per request via React cache() —
 * requireSession() and the (app) shell guard both call it in one request
 * without a duplicate query.
 *
 * Node-only (the repo resolves the postgres-js client) — do NOT import from
 * proxy.ts or other edge code.
 */
import { cache } from 'react';

import { getUserRepo } from '@/lib/server/repositories/factory';

export async function fetchSessionVersion(userId: string): Promise<number | null> {
  const repo = await getUserRepo();
  // Repo returns undefined for an absent row; preserve the historical null.
  return (await repo.getSessionVersion(userId)) ?? null;
}

export const getDbSessionVersion = cache(async (userId: string): Promise<number | null> => {
  return fetchSessionVersion(userId);
});

/**
 * Email-verification flag for the (app) shell guard. Deliberately read from the
 * DB (NOT the JWT) so a just-completed verification reflects immediately without
 * re-login — same rationale as the live emailVerified reads elsewhere. Absent
 * user row → false (treated as unverified); in practice an absent row is caught
 * by the session-version (revocation) check first.
 */
export async function fetchEmailVerified(userId: string): Promise<boolean> {
  const repo = await getUserRepo();
  // Repo returns undefined for an absent row; preserve the historical false.
  return (await repo.getEmailVerified(userId)) ?? false;
}

export const getDbEmailVerified = cache(async (userId: string): Promise<boolean> => {
  return fetchEmailVerified(userId);
});
