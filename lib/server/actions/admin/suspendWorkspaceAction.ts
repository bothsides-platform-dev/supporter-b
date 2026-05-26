'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { workspaces, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function suspendWorkspaceAction(
  db: DB = actionDb(),
  workspaceId: string,
  reason: string,
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx
      .update(workspaces)
      .set({ status: 'suspended', statusReason: reason.trim(), reviewedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.suspend',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { after: { status: 'suspended' }, reason: reason.trim() },
    });
  });

  revalidatePath('/admin/review');
  revalidatePath('/admin');
  return { ok: true };
}
