// retryEmailNotificationAction tests.
//
// 검증:
//   - 미인증 → UNAUTHENTICATED
//   - 타인 notification → NOT_FOUND
//   - notification.type이 outbox enum에 없는 경우(rfp.rejected 등) → NO_EMAIL
//   - 매칭 outbox row 없음 → NO_FAILED_OUTBOX
//   - 정상 케이스: status 'failed' → 'pending', attempts 보존
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  notifications as notifTable,
  outboxEntries,
} from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { PgliteDB } from '@/lib/db/client-pglite';
import {
  setupNotifActionEnv,
  teardownNotifActionEnv,
} from './_setup';

const sessionRef: {
  value: { user: { id: string; email: string } } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { retryEmailNotificationAction } from '../retryEmailNotificationAction';

let db: PgliteDB;

async function insertNotif(
  userId: string,
  workspaceId: string,
  type: string,
): Promise<string> {
  const id = randomUUID();
  await db.insert(notifTable).values({
    id,
    userId,
    workspaceId,
    type,
    title: 't',
    body: 'b',
    channel: 'in_app',
    status: 'queued',
  });
  return id;
}

describe('retryEmailNotificationAction', () => {
  beforeEach(async () => {
    db = await setupNotifActionEnv();
  });
  afterEach(() => {
    teardownNotifActionEnv();
    sessionRef.value = null;
  });

  it('rejects without session', async () => {
    const r = await retryEmailNotificationAction({
      notificationId: randomUUID(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('UNAUTHENTICATED');
  });

  it('rejects taking over another user notification with NOT_FOUND', async () => {
    const u1 = await seedUser(db, { email: 'u1@x.com' });
    const u2 = await seedUser(db, { email: 'u2@x.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u1.id, 'admin');
    await seedMembership(db, ws.id, u2.id, 'member');
    const nid = await insertNotif(u1.id, ws.id, 'bid.submitted');

    sessionRef.value = { user: { id: u2.id, email: u2.email } };
    const r = await retryEmailNotificationAction({ notificationId: nid });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NOT_FOUND');
  });

  it('returns NO_EMAIL when notification.type is not in outbox enum (e.g. rfp.rejected)', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id, 'admin');
    const nid = await insertNotif(u.id, ws.id, 'rfp.rejected');

    sessionRef.value = { user: { id: u.id, email: u.email } };
    const r = await retryEmailNotificationAction({ notificationId: nid });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NO_EMAIL');
  });

  it('returns NO_FAILED_OUTBOX when no failed row matches', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id, 'admin');
    const nid = await insertNotif(u.id, ws.id, 'bid.submitted');
    // outbox row with status='sent' — should not be picked.
    await db.insert(outboxEntries).values({
      event: 'bid.submitted',
      toAddr: u.email,
      subject: 's',
      html: 'h',
      status: 'sent',
      attempts: 1,
    });

    sessionRef.value = { user: { id: u.id, email: u.email } };
    const r = await retryEmailNotificationAction({ notificationId: nid });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('NO_FAILED_OUTBOX');
  });

  it('flips matching failed outbox row → pending, preserves attempts', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id, 'admin');
    const nid = await insertNotif(u.id, ws.id, 'bid.submitted');

    const obxId = randomUUID();
    await db.insert(outboxEntries).values({
      id: obxId,
      event: 'bid.submitted',
      toAddr: u.email,
      subject: 's',
      html: 'h',
      status: 'failed',
      attempts: 3,
      lastError: 'connection reset',
    });

    sessionRef.value = { user: { id: u.id, email: u.email } };
    const r = await retryEmailNotificationAction({ notificationId: nid });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outboxId).toBe(obxId);

    const [row] = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.id, obxId));
    expect(row.status).toBe('pending');
    // attempts preserved per spec
    expect(row.attempts).toBe(3);
    // lastError 그대로 — dispatcher가 다음 시도 후 갱신.
    expect(row.lastError).toBe('connection reset');
  });
});
