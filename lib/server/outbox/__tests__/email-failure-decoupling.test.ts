// Invariant: a failed EMAIL send must never affect the in-app NOTIFICATION.
//
// Domain events (bid.submitted, rfp.invited, …) insert an in-app notification
// row AND enqueue an outbox email row inside the SAME transaction — so the
// in-app notice is durable the moment the action commits. Email delivery is a
// separate, later, best-effort step: the outbox flush sends and records the
// result on the OUTBOX row only. This test pins that decoupling at the
// persistence layer: flushing with an always-failing sender must leave the
// notification row completely untouched.
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { notifications, outboxEntries } from '@/lib/db/schema';
import { DrizzleOutboxRepository } from '@/lib/server/repositories/drizzle/outbox';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { BatchSender } from '../types';

async function seedEvent() {
  const db = await createPgliteDb();
  const repo = new DrizzleOutboxRepository(db);
  const user = await seedUser(db, { email: 'buyer@b.com', name: '담당' });
  const ws = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, ws.id, user.id, 'admin');

  // The in-app half of a domain event.
  await db.insert(notifications).values({
    userId: user.id,
    workspaceId: ws.id,
    type: 'bid.submitted',
    title: '견적이 도착했어요',
    body: 'OO페이가 견적을 보냈어요.',
    channel: 'in_app',
    status: 'queued',
    linkUrl: '/rfp/P-2605-0042',
  });
  // The email half of the same event.
  await repo.enqueue({
    event: 'bid.submitted',
    to: user.email,
    subject: '견적이 도착했어요',
    html: '<p>x</p>',
    maxAttempts: 5,
  });

  return { db, repo, user, ws };
}

async function readNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId));
  return row;
}

describe('email failure ⊥ in-app notification', () => {
  it('keeps the in-app notification intact when a PERMANENT email send fails', async () => {
    const { db, repo, user } = await seedEvent();
    const failPermanent = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) =>
        entries.map(() => ({ ok: false as const, error: 'invalid recipient', retryable: false })),
      );

    await repo.flush(failPermanent);

    // Outbox row failed…
    const [mail] = await db.select().from(outboxEntries);
    expect(mail.status).toBe('failed');

    // …but the in-app notification is byte-for-byte unchanged: still queued,
    // never read, title/body preserved.
    const notif = await readNotification(db, user.id);
    expect(notif.status).toBe('queued');
    expect(notif.readAt).toBeNull();
    expect(notif.title).toBe('견적이 도착했어요');
    expect(notif.body).toBe('OO페이가 견적을 보냈어요.');
  });

  it('keeps the in-app notification intact when a RETRYABLE email send fails (backs off)', async () => {
    const { db, repo, user } = await seedEvent();
    const failTransient = vi
      .fn<BatchSender>()
      .mockImplementation(async (entries) =>
        entries.map(() => ({ ok: false as const, error: '429', retryable: true })),
      );

    await repo.flush(failTransient);

    // Outbox row still pending (will retry on backoff)…
    const [mail] = await db.select().from(outboxEntries);
    expect(mail.status).toBe('pending');
    expect(mail.attempts).toBe(1);

    // …notification unchanged regardless of the email's retry state.
    const notif = await readNotification(db, user.id);
    expect(notif.status).toBe('queued');
    expect(notif.readAt).toBeNull();
  });
});
