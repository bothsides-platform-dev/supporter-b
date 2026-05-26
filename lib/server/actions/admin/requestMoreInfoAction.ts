'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { verificationApplications, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function requestMoreInfoAction(
  db: DB = actionDb(),
  workspaceId: string,
  reason: string,
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const session = await requireAdminSession();
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.update(verificationApplications)
      .set({ status: 'needs_more_info', reviewedBy: session.adminId, reviewedAt: now, reason })
      .where(eq(verificationApplications.workspaceId, workspaceId));

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'workspace.needs_more_info',
      entityType: 'workspace',
      entityId: workspaceId,
      payloadJson: { reason },
    });
  });

  revalidatePath('/admin/review');
  revalidatePath('/admin');
  return { ok: true };
}
