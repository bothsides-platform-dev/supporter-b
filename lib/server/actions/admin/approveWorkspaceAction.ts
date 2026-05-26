'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;

export async function approveWorkspaceAction(db: DB = actionDb(), workspaceId: string) {
  const session = await requireAdminSession();
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.update(workspaces)
      .set({ status: 'active', reviewedAt: now })
      .where(eq(workspaces.id, workspaceId));

    await tx.update(verificationApplications)
      .set({ status: 'approved', reviewedBy: session.adminId, reviewedAt: now })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.approve',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'active' } },
    });
  });

  revalidatePath('/admin/review');
  revalidatePath('/admin');
}
