'use server';

import { adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true; sent: number } | { ok: false; error: string };

export async function sendReminderAction(
  db: DB = actionDb(),
  rfpId: string,
  pgWsIds: string[],
): Promise<Result> {
  if (!pgWsIds.length) return { ok: false, error: 'NO_TARGETS' };

  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).transaction(async (tx: any) => {
    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'reminder.send',
      entityType: 'rfp',
      entityId: rfpId,
      payloadJson: {
        after: { targetCount: pgWsIds.length, pgWsIds },
      },
    });
  });

  return { ok: true, sent: pgWsIds.length };
}
