// Active-workspace resolution — shared by login (auth.ts `authorize`) and the
// runtime switch (switchWorkspaceAction). Node-only (touches the DB); MUST NOT
// be imported by auth.config.ts, which stays edge-safe.
import { and, asc, eq } from 'drizzle-orm';
import { workspaceMembers, workspaces } from '@/lib/db/schema';

export type ActiveMembership = {
  workspaceId: string;
  role: 'admin' | 'member';
  workspaceType: 'buyer' | 'pg';
};

// drizzle instance — postgres-js in prod, pglite in tests. Typed loosely to
// match the shared `actionDb()` / repo db handles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const membershipProjection = {
  workspaceId: workspaceMembers.workspaceId,
  role: workspaceMembers.role,
  workspaceType: workspaces.type,
} as const;

/** Membership of a specific workspace, with role + workspace type, or null. */
export async function getMembership(
  db: Db,
  userId: string,
  workspaceId: string,
): Promise<ActiveMembership | null> {
  const [row] = await db
    .select(membershipProjection)
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
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
  const [row] = await db
    .select(membershipProjection)
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.joinedAt))
    .limit(1);
  return row ?? null;
}
