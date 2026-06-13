// Master/operator Google-OAuth login — Node-only (touches the DB, bcrypt).
// MUST NOT be imported by auth.config.ts (edge-safe). Used by auth.ts to
// (a) default-deny non-master Google sign-ins and (b) map a verified Google
// identity onto a provisioned `users` row + active workspace.
import { randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { users, workspaces } from '@/lib/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import type { AuthorizedUser } from '@/lib/auth/credentials';

// drizzle instance — postgres-js in prod, pglite in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Auth.js `signIn` callback gate. Credentials sign-ins are already validated by
 * `authorize`, so they pass through. Google sign-ins are DEFAULT-DENY: only a
 * Google-verified email on the `MASTER_ACCOUNT_EMAILS` allowlist is allowed.
 */
export function allowSignIn(params: {
  provider?: string;
  emailVerified?: boolean;
  email?: string | null;
}): boolean {
  if (params.provider !== 'google') return true;
  if (!params.emailVerified) return false;
  return isMasterEmail(params.email);
}

/** First active workspace to land a master in: remembered if still active, else earliest-created. */
async function resolveMasterWorkspace(
  db: Db,
  lastActiveWorkspaceId: string | null,
): Promise<{ id: string; type: 'buyer' | 'pg' } | null> {
  if (lastActiveWorkspaceId) {
    const [remembered] = await db
      .select({ id: workspaces.id, type: workspaces.type })
      .from(workspaces)
      .where(and(eq(workspaces.id, lastActiveWorkspaceId), eq(workspaces.status, 'active')))
      .limit(1);
    if (remembered) return remembered;
  }
  const [earliest] = await db
    .select({ id: workspaces.id, type: workspaces.type })
    .from(workspaces)
    .where(eq(workspaces.status, 'active'))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  return earliest ?? null;
}

/**
 * Resolve (or auto-provision) the master `users` row for a Google-verified
 * master email, and pick the active workspace to land in. The provisioned row
 * gets a random unusable password hash — masters never log in via credentials
 * (`authorizeCredentials` rejects allowlist emails), so the hash is never used.
 */
export async function resolveMasterUser(
  db: Db,
  email: string,
  name?: string | null,
): Promise<AuthorizedUser> {
  const normalized = email.trim().toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) {
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    [user] = await db
      .insert(users)
      .values({
        email: normalized,
        passwordHash,
        name: name?.trim() || normalized,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        // System-managed operator account — hidden from member lists (see
        // workspace.ts isSystemAccount filter). Masters never hold a membership
        // row, but this keeps the flag consistent with its documented intent.
        isSystemAccount: true,
      })
      .returning();
  }

  const ws = await resolveMasterWorkspace(db, user.lastActiveWorkspaceId);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 1,
    workspaceId: ws?.id,
    workspaceType: ws?.type,
    role: ws ? 'admin' : undefined,
  };
}

/**
 * Node-runtime jwt callback for `auth.ts`. On a Google sign-in it maps the
 * verified Google identity onto a provisioned master `users` row (so the token
 * carries OUR DB id + active workspace, not the Google `sub`), then delegates to
 * the shared edge-safe jwt callback which stamps the token + derives `isMaster`.
 * All other calls (credentials login, refresh, switch) pass straight through.
 */
export function makeNodeJwtCallback(
  db: Db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharedJwt: (params: any) => Promise<any>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (params: any) => {
    if (params.account?.provider === 'google' && params.user) {
      // Resolve the verified Google email with the SAME precedence the signIn
      // gate uses (profile first) so the gated identity and the provisioned
      // identity can never diverge for a future provider.
      const email = params.profile?.email ?? params.user.email;
      const name = params.user.name ?? params.profile?.name;
      const master = await resolveMasterUser(db, email, name);
      return sharedJwt({ ...params, user: master });
    }
    return sharedJwt(params);
  };
}
