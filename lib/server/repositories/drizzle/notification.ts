import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { notifications } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from '@/lib/types/notification';
import type { NotificationRepo, Tx } from '../types';

type NotifRow = typeof notifications.$inferSelect;

function dbChannel(c: NotifRow['channel']): NotificationChannel {
  return c === 'in_app' ? 'inapp' : 'email';
}
function uiChannel(c: NotificationChannel): NotifRow['channel'] {
  return c === 'inapp' ? 'in_app' : 'email';
}
function dbStatus(s: NotifRow['status']): NotificationStatus {
  return s === 'queued' ? 'pending' : (s as NotificationStatus);
}
function uiStatus(s: NotificationStatus): NotifRow['status'] {
  return s === 'pending' ? 'queued' : (s as NotifRow['status']);
}

function rowToNotification(row: NotifRow): Notification {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    type: row.type,
    title: row.title,
    body: row.body,
    channel: dbChannel(row.channel),
    status: dbStatus(row.status),
    linkUrl: row.linkUrl ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : undefined,
    readAt: row.readAt ? new Date(row.readAt).toISOString() : undefined,
  };
}

export class DrizzleNotificationRepository implements NotificationRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(n: Notification, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    // 알림은 append-only(생성 시 고유 uuid). 파티션 테이블은 id 단독 UNIQUE 가
    // 불가하므로 onConflict(id) 불가 — 평범한 insert. 상태 변경은 markRead 경유.
    await db.insert(notifications).values({
      id: n.id,
      userId: n.userId,
      workspaceId: n.workspaceId,
      type: n.type,
      title: n.title,
      body: n.body,
      channel: uiChannel(n.channel),
      status: uiStatus(n.status),
      linkUrl: n.linkUrl ?? null,
      sentAt: n.sentAt ? new Date(n.sentAt) : null,
      readAt: n.readAt ? new Date(n.readAt) : null,
    });
  }

  async findRecentForUser(
    userId: string,
    workspaceId: string,
    limit: number,
    channel?: NotificationChannel,
    tx?: Tx,
  ): Promise<Notification[]> {
    const db = this.h(tx);
    const base = and(
      eq(notifications.userId, userId),
      eq(notifications.workspaceId, workspaceId),
    );
    const where = channel ? and(base, eq(notifications.channel, uiChannel(channel))) : base;
    const rows = await db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map(rowToNotification);
  }

  async markRead(id: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(notifications)
      .set({ status: 'read', readAt: sql`now()` })
      .where(eq(notifications.id, id));
  }

  async markAllRead(userId: string, workspaceId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(notifications)
      .set({ status: 'read', readAt: sql`now()` })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.workspaceId, workspaceId),
          isNull(notifications.readAt),
        ),
      );
  }
}
