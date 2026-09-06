import { defineAsyncSingleton } from '@/lib/server/_singleton';
import type { NotificationRepo, OutboxRepo, UserRepo } from '@/lib/server/repositories/types';
import type { ServiceResult } from './types';
import { OUTBOX_EVENTS, type OutboxEvent } from '@/lib/server/outbox/types';
import {
  getNotificationRepo,
  getOutboxRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';

// outbox enum(런타임 튜플)에서 파생 — 손으로 나열하면 새 이메일 이벤트가
// 재시도 불가(NO_EMAIL)로 조용히 빠진다 (requote 가 실제 그랬다).
const ALLOWED_OUTBOX_EVENTS = new Set<string>(OUTBOX_EVENTS);

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

export const {
  get: getNotificationService,
  set: __setNotificationServiceForTest,
  reset: __resetNotificationServiceForTest,
} = defineAsyncSingleton('notification_service', 'service', async () => {
  const [notifRepo, outboxRepo, userRepo] = await Promise.all([
    getNotificationRepo(),
    getOutboxRepo(),
    getUserRepo(),
  ]);
  return new NotificationService(notifRepo, outboxRepo, userRepo);
});
