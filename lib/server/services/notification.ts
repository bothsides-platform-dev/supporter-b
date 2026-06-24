import type { NotificationRepo, OutboxRepo, UserRepo } from '@/lib/server/repositories/types';
import type { ServiceResult } from './types';
import type { OutboxEvent } from '@/lib/server/outbox/types';
import {
  getNotificationRepo,
  getOutboxRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';

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
    private readonly notifRepo: NotificationRepo,
    private readonly outboxRepo: OutboxRepo,
    private readonly userRepo: UserRepo,
  ) {}

  async markRead(
    notificationId: string,
    actor: NotifActor,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const notif = await this.notifRepo.findOwnedById(notificationId, actor.userId);
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
    const notif = await this.notifRepo.findOwnedById(notificationId, actor.userId);
    if (!notif) return { ok: false, error: 'NOT_FOUND' };

    if (!ALLOWED_OUTBOX_EVENTS.has(notif.type)) {
      return { ok: false, error: 'NO_EMAIL' };
    }

    const user = await this.userRepo.findById(actor.userId);
    if (!user) return { ok: false, error: 'USER_NOT_FOUND' };

    const row = await this.outboxRepo.findLatestFailed({
      to: user.email,
      event: notif.type as OutboxEvent,
    });
    if (!row) return { ok: false, error: 'NO_FAILED_OUTBOX' };

    await this.outboxRepo.requeue(row.id);

    return { ok: true, outboxId: row.id };
  }
}

declare global {
  var __bidit_notification_service__: NotificationService | undefined;
  var __bidit_notification_service_override__: NotificationService | undefined;
}

export async function getNotificationService(): Promise<NotificationService> {
  if (globalThis.__bidit_notification_service_override__) {
    return globalThis.__bidit_notification_service_override__;
  }
  if (!globalThis.__bidit_notification_service__) {
    const [notifRepo, outboxRepo, userRepo] = await Promise.all([
      getNotificationRepo(),
      getOutboxRepo(),
      getUserRepo(),
    ]);
    globalThis.__bidit_notification_service__ = new NotificationService(
      notifRepo,
      outboxRepo,
      userRepo,
    );
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
