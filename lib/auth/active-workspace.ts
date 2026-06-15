// Active-workspace resolution — shared by login (auth.ts `authorize`) and the
// runtime switch (switchWorkspaceAction). Node-only (the repo resolves the
// postgres-js client); MUST NOT be imported by auth.config.ts, which stays
// edge-safe.
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

export type ActiveMembership = {
  workspaceId: string;
  role: 'admin' | 'member';
  workspaceType: 'buyer' | 'pg';
};

// drizzle instance — postgres-js in prod, pglite in tests. DB access now goes
// through the repository factory; the param is retained for call-site
// compatibility (services/actions/pages) but is no longer touched directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Membership of a specific workspace, with role + workspace type, or null. */
export async function getMembership(
  _db: Db,
  userId: string,
  workspaceId: string,
): Promise<ActiveMembership | null> {
  const workspaceRepo = await getWorkspaceRepo();
  const row = await workspaceRepo.getMembership(userId, workspaceId);
  if (!row) return null;
  // Repo names the key `type`; the app shape uses `workspaceType`.
  return {
    workspaceId,
    role: row.role as ActiveMembership['role'],
    workspaceType: row.type,
  };
}

/**
 * Pick the workspace a user lands in: their remembered `lastActiveWorkspaceId`
 * if they're still a member, else the earliest-joined membership. null when the
 * user belongs to no workspace.
 */
export async function resolveInitialMembership(
  db: Db,
  userId: string,
  lastActiveWorkspaceId: string | null,
): Promise<ActiveMembership | null> {
  if (lastActiveWorkspaceId) {
    const preferred = await getMembership(db, userId, lastActiveWorkspaceId);
    if (preferred) return preferred;
  }
  const workspaceRepo = await getWorkspaceRepo();
  const row = await workspaceRepo.findInitialMembership(userId);
  if (!row) return null;
  // Repo names the key `type`; the app shape uses `workspaceType`.
  return {
    workspaceId: row.workspaceId,
    role: row.role as ActiveMembership['role'],
    workspaceType: row.type,
  };
}
