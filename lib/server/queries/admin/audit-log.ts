import { desc } from 'drizzle-orm';
import { adminAuditLogs } from '@/lib/db/schema';
import { actionDb } from '@/lib/server/actions/auth/_shared';

export type AuditLogRow = typeof adminAuditLogs.$inferSelect;

export async function listAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  return actionDb()
    .select()
    .from(adminAuditLogs)
    .orderBy(desc(adminAuditLogs.occurredAt))
    .limit(limit) as Promise<AuditLogRow[]>;
}
