'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { rfps, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function extendRfpDeadlineAction(
  db: DB = actionDb(),
  rfpId: string,
  days = 7,
): Promise<Result> {
  if (days < 1 || days > 30) return { ok: false, error: 'INVALID_DAYS' };

  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rfp] = await (db as any).select({ deadline: rfps.deadline }).from(rfps).where(eq(rfps.id, rfpId));
  if (!rfp) return { ok: false, error: 'NOT_FOUND' };

  const oldDeadline = rfp.deadline;
  const newDeadline = new Date(new Date(oldDeadline).getTime() + days * 86_400_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).transaction(async (tx: any) => {
    await tx.update(rfps).set({ deadline: newDeadline }).where(eq(rfps.id, rfpId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'rfp.extend',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: {
        before: { deadline: oldDeadline },
        after: { deadline: newDeadline },
        reason: `+${days}일 연장`,
      },
    });
  });

  revalidatePath(`/admin/rfps/${rfpId}`);
  revalidatePath('/admin/rfps');
  return { ok: true };
}
