'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;

export async function unsuspendWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
): Promise<void> {
  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx
      .update(workspaces)
      .set({ status: 'active', statusReason: null, reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.unsuspend',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath('/admin');
}
