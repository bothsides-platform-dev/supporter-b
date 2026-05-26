'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { bids, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function hideQuoteAction(
  db: DB = actionDb(),
  bidId: string,
  reason: string,
): Promise<Result> {
  if (!reason?.trim()) return { ok: false, error: 'REASON_REQUIRED' };

  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bid] = await (db as ReturnType<typeof actionDb>).select({ rfpId: bids.rfpId }).from(bids).where(eq(bids.id, bidId));
  if (!bid) return { ok: false, error: 'NOT_FOUND' };
  const rfpId = bid.rfpId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.update(bids).set({ status: 'withdrawn' }).where(eq(bids.id, bidId));
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'bid.hide',
      entityType: 'bid',
      entityId: bidId,
      payloadJson: {
        after: { status: 'withdrawn' },
        reason: reason.trim(),
      },
    });
  });

  revalidatePath(`/admin/rfps/${rfpId}`);
  revalidatePath('/admin/rfps');
  return { ok: true };
}
