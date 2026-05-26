'use server';

import { revalidatePath } from 'next/cache';
import { adminNotes, adminAuditLogs } from '@/lib/db/schema';
import { requireAdminSession } from '@/lib/auth/admin-session';
import { actionDb } from '@/lib/server/actions/auth/_shared';
import type { PgliteDB } from '@/lib/db/client-pglite';

type DB = ReturnType<typeof actionDb> | PgliteDB;
type Result = { ok: true } | { ok: false; error: string };

export async function createAdminNoteAction(
  db: DB = actionDb(),
  entityType: string,
  entityId: string,
  body: string,
  revalidate?: string,
): Promise<Result> {
  if (!body?.trim()) return { ok: false, error: 'BODY_REQUIRED' };

  const session = await requireAdminSession();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as ReturnType<typeof actionDb>).transaction(async (tx: any) => {
    await tx.insert(adminNotes).values({
      entityType,
      entityId,
      body: body.trim(),
      createdBy: session.adminId,
    });

    await tx.insert(adminAuditLogs).values({
      actor: session.adminId,
      action: 'note.create',
      entityType,
      entityId,
      payloadJson: { after: { body: body.trim() } },
    });
  });

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
