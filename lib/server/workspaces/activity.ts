import { getAuditLogRepo } from '@/lib/server/repositories/factory';
import type { AuditLogCursor, AuditLogRecord } from '@/lib/server/repositories/types';

export type WorkspaceActivityItem = Pick<AuditLogRecord,
  'id' | 'action' | 'createdAt' | 'entityType' | 'entityId' | 'actorName' | 'viaMaster' | 'metadata'
>;

/** 활동 문구에 쓰는 값만 브라우저에 보낸다. 원본에는 초대 이메일이나 이름도 들어갈 수 있다. */
function summaryMetadata(metadata: AuditLogRecord['metadata']) {
  if (!metadata) return null;
  const summary: Record<string, unknown> = {};
  if (metadata.role === 'admin' || metadata.role === 'member') summary.role = metadata.role;
  if (typeof metadata.visible === 'boolean') summary.visible = metadata.visible;
  if (typeof metadata.sentCount === 'number') summary.sentCount = metadata.sentCount;
  if (typeof metadata.round === 'number') summary.round = metadata.round;
  return summary;
}

export async function listWorkspaceActivity(
  workspaceId: string,
  options: { limit: number; before?: AuditLogCursor },
) {
  const rows = await (await getAuditLogRepo()).listForWorkspace(workspaceId, options);
  const maskedActorIds = new Set(
    (process.env.AUDIT_LOG_MASKED_ACTOR_IDS ?? '').split(',').map(id => id.trim().toLowerCase()),
  );
  const logs: WorkspaceActivityItem[] = rows.map(row => ({
    id: row.id,
    action: row.action,
    createdAt: row.createdAt,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: maskedActorIds.has(row.actorUserId) ? '이름 비공개' : row.actorName,
    viaMaster: row.viaMaster,
    metadata: summaryMetadata(row.metadata),
  }));
  const last = logs.at(-1);
  const nextCursor = logs.length === options.limit && last ? { createdAt: last.createdAt, id: last.id } : null;
  return { logs, nextCursor };
}
