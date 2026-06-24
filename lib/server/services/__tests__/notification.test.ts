import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getNotificationRepo,
  getOutboxRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';
import { notifications, outboxEntries } from '@/lib/db/schema';
import type { OutboxEvent } from '@/lib/server/outbox/types';
import { seedUser, seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';

import {
  NotificationService,
  __resetNotificationServiceForTest,
  __setNotificationServiceForTest,
  getNotificationService,
} from '../notification';

let db: PgliteDB;

async function buildService(): Promise<NotificationService> {
  const [notifRepo, outboxRepo, userRepo] = await Promise.all([
    getNotificationRepo(),
    getOutboxRepo(),
    getUserRepo(),
  ]);
  return new NotificationService(notifRepo, outboxRepo, userRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetNotificationServiceForTest();
  __resetForTest();
});

async function seedNotification(userId: string, workspaceId: string, type = 'rfp.invited'): Promise<string> {
  const id = randomUUID();
  await db.insert(notifications).values({
    id,
    userId,
    workspaceId,
    type,
    title: 'Test notification',
    channel: 'in_app',
  });
  return id;
}

async function seedOutboxEntry(toAddr: string, event: OutboxEvent, status: 'failed' | 'sent' | 'pending'): Promise<string> {
  const [row] = await db
    .insert(outboxEntries)
    .values({
      toAddr,
      event,
      subject: 'Test',
      html: '<p>test</p>',
      status,
      dedupeKey: `${event}:${toAddr}:${randomUUID()}`,
    })
    .returning({ id: outboxEntries.id });
  return row.id;
}

describe('NotificationService.markRead', () => {
  it('marks a notification as read', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const user = await seedUser(db);
    const notifId = await seedNotification(user.id, ws.id);

    const r = await svc.markRead(notifId, { userId: user.id });
    expect(r).toEqual({ ok: true });

    const [n] = await db.select().from(notifications).where(eq(notifications.id, notifId));
    expect(n.readAt).not.toBeNull();
  });

  it('returns NOT_FOUND for a notification that belongs to another user', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const owner = await seedUser(db, { email: 'owner@example.com' });
    const other = await seedUser(db, { email: 'other@example.com' });
    const notifId = await seedNotification(owner.id, ws.id);

    const r = await svc.markRead(notifId, { userId: other.id });
    expect(r).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for an unknown notification id', async () => {
    const svc = await buildService();
    const user = await seedUser(db);

    const r = await svc.markRead(randomUUID(), { userId: user.id });
    expect(r).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});

describe('NotificationService.markAllRead', () => {
  it('marks all notifications read for a user+workspace', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const user = await seedUser(db);
    await seedNotification(user.id, ws.id);
    await seedNotification(user.id, ws.id);

    const r = await svc.markAllRead({ userId: user.id, workspaceId: ws.id });
    expect(r).toEqual({ ok: true });

    const rows = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.userId, user.id));
    expect(rows.every((n) => n.readAt !== null)).toBe(true);
  });
});

describe('NotificationService.retryEmail', () => {
  it('returns NOT_FOUND for an unknown notification', async () => {
    const svc = await buildService();
    const user = await seedUser(db);

    const r = await svc.retryEmail(randomUUID(), { userId: user.id });
    expect(r).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('returns NO_EMAIL when notification type has no outbox event', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const user = await seedUser(db);
    const notifId = await seedNotification(user.id, ws.id, 'rfp.cancelled');

    const r = await svc.retryEmail(notifId, { userId: user.id });
    expect(r).toEqual({ ok: false, error: 'NO_EMAIL' });
  });

  it('returns NO_FAILED_OUTBOX when no failed outbox row exists', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const user = await seedUser(db, { email: 'user@example.com' });
    const notifId = await seedNotification(user.id, ws.id, 'rfp.invited');

    const r = await svc.retryEmail(notifId, { userId: user.id });
    expect(r).toEqual({ ok: false, error: 'NO_FAILED_OUTBOX' });
  });

  it('resets outbox status to pending and returns outboxId on success', async () => {
    const svc = await buildService();
    const ws = await seedPgWorkspace(db, 'WS');
    const user = await seedUser(db, { email: 'user@example.com' });
    const notifId = await seedNotification(user.id, ws.id, 'rfp.invited');
    const outboxId = await seedOutboxEntry('user@example.com', 'rfp.invited', 'failed');

    const r = await svc.retryEmail(notifId, { userId: user.id });
    expect(r).toEqual({ ok: true, outboxId });

    const [entry] = await db.select({ status: outboxEntries.status }).from(outboxEntries).where(eq(outboxEntries.id, outboxId));
    expect(entry.status).toBe('pending');
  });
});

describe('getNotificationService / __setNotificationServiceForTest / __resetNotificationServiceForTest', () => {
  it('__setNotificationServiceForTest overrides the singleton', async () => {
    const fake = {} as NotificationService;
    __setNotificationServiceForTest(fake);
    const svc = await getNotificationService();
    expect(svc).toBe(fake);
  });
});
