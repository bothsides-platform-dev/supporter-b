import { and, eq } from 'drizzle-orm';
import { workspaceMembers, users } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;

export interface WorkspaceOwnerContact {
  name: string;
  email: string;
  phone: string | null;
}

/**
 * The admin member of a workspace — for PG workspaces this is the registering
 * user, whose `users` record holds the verified phone. Used by admin pages to
 * show a contact for the workspace (replacing the removed pgProfiles.salesContact).
 */
export async function getWorkspaceAdminUser(
  workspaceId: string,
  db: DB = actionDb(),
): Promise<WorkspaceOwnerContact | null> {
  const [row] = await (db as PgliteDB)
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.role, 'admin'),
      ),
    )
    .limit(1);

  return row ?? null;
}
