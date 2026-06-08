import { and, desc, eq } from 'drizzle-orm';
import { notifications, outboxEntries, users } from '@/lib/db/schema';
import type { NotificationRepo } from '@/lib/server/repositories/types';
import type { ServiceResult } from './types';
import type { OutboxEvent } from '@/lib/server/outbox/types';
import { getNotificationRepo } from '@/lib/server/repositories/factory';

const ALLOWED_OUTBOX_EVENTS = new Set<string>([
  'auth.verify',
  'auth.reset',
  'auth.email-change',
  'rfp.invited',
  'rfp.sent',
  'bid.submitted',
  'rfp.awarded',
]);

type NotifActor = { userId: string };

export class NotificationService {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _db: any,
    private readonly notifRepo: NotificationRepo,
  ) {}

  async markRead(
    notificationId: string,
    actor: NotifActor,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const [notif] = await this._db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, actor.userId)))
      .limit(1);
    if (!notif) return { ok: false, error: 'NOT_FOUND' };

    await this.notifRepo.markRead(notificationId);
    return { ok: true };
  }

  async markAllRead(actor: { userId: string; workspaceId: string }): Promise<{ ok: true }> {
    await this.notifRepo.markAllRead(actor.userId, actor.workspaceId);
    return { ok: true };
  }

  async retryEmail(
    notificationId: string,
    actor: NotifActor,
  ): Promise<ServiceResult<{ outboxId: string }>> {
    const [notif] = await this._db
      .select({ type: notifications.type })
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, actor.userId)))
      .limit(1);
    if (!notif) return { ok: false, error: 'NOT_FOUND' };

    if (!ALLOWED_OUTBOX_EVENTS.has(notif.type)) {
      return { ok: false, error: 'NO_EMAIL' };
    }

    const [user] = await this._db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    if (!user) return { ok: false, error: 'USER_NOT_FOUND' };

    const [row] = await this._db
      .select({ id: outboxEntries.id })
      .from(outboxEntries)
      .where(
        and(
          eq(outboxEntries.toAddr, user.email),
          eq(outboxEntries.event, notif.type as OutboxEvent),
          eq(outboxEntries.status, 'failed'),
        ),
      )
      .orderBy(desc(outboxEntries.scheduledAt))
      .limit(1);
    if (!row) return { ok: false, error: 'NO_FAILED_OUTBOX' };

    await this._db
      .update(outboxEntries)
      .set({ status: 'pending' })
      .where(eq(outboxEntries.id, row.id));

    return { ok: true, outboxId: row.id };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __bidit_notification_service__: NotificationService | undefined;
  // eslint-disable-next-line no-var
  var __bidit_notification_service_override__: NotificationService | undefined;
}

export async function getNotificationService(): Promise<NotificationService> {
  if (globalThis.__bidit_notification_service_override__) {
    return globalThis.__bidit_notification_service_override__;
  }
  if (!globalThis.__bidit_notification_service__) {
    const notifRepo = await getNotificationRepo();
    const { actionDb } = await import('@/lib/server/actions/notifications/_shared');
    globalThis.__bidit_notification_service__ = new NotificationService(actionDb(), notifRepo);
  }
  return globalThis.__bidit_notification_service__!;
}

export function __resetNotificationServiceForTest(): void {
  globalThis.__bidit_notification_service__ = undefined;
  globalThis.__bidit_notification_service_override__ = undefined;
}

export function __setNotificationServiceForTest(svc: NotificationService): void {
  globalThis.__bidit_notification_service_override__ = svc;
}
