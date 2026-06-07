// DrizzleNotificationRepository contract — pglite-backed.
//
// Covers `findRecentForUser` channel filter (for the settings page archive
// view that shows only in-app rows), plus the default behaviour and ordering.
// Other notification methods (save / markRead / markAllRead) are exercised
// indirectly via the action tests; this file focuses on the SQL-level filter
// added in the settings rework.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createPgliteDb } from '@/lib/db/client-pglite';
import { notifications } from '@/lib/db/schema';
import { DrizzleNotificationRepository } from '../notification';
import { seedBuyerWorkspace, seedMembership, seedUser } from './_seed';
import type { Notification, NotificationChannel } from '@/lib/types/notification';

async function setup() {
  const db = await createPgliteDb();
  const repo = new DrizzleNotificationRepository(db);
  const user = await seedUser(db);
  const ws = await seedBuyerWorkspace(db);
  await seedMembership(db, ws.id, user.id);
  return { db, repo, user, ws };
}

function buildNotification(
  overrides: Partial<Notification> & {
    userId: string;
    workspaceId: string;
    channel: NotificationChannel;
  },
): Notification {
  return {
    id: randomUUID(),
    type: 'RFP_SENT',
    title: 't',
    body: 'b',
    status: 'sent',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DrizzleNotificationRepository.findRecentForUser', () => {
  it('returns both channels when no filter is supplied (regression)', async () => {
    const { repo, user, ws } = await setup();
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }),
    );
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'email' }),
    );

    const rows = await repo.findRecentForUser(user.id, ws.id, 10);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['inapp', 'email']));
  });

  it("filters to inapp rows only when channel: 'inapp' is supplied", async () => {
    const { repo, user, ws } = await setup();
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }),
    );
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'email' }),
    );
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }),
    );

    const rows = await repo.findRecentForUser(user.id, ws.id, 10, 'inapp');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === 'inapp')).toBe(true);
  });

  it("filters to email rows only when channel: 'email' is supplied", async () => {
    const { repo, user, ws } = await setup();
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }),
    );
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'email' }),
    );

    const rows = await repo.findRecentForUser(user.id, ws.id, 10, 'email');
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('email');
  });

  it('orders by createdAt desc and respects limit', async () => {
    const { db, repo, user, ws } = await setup();
    // Insert via raw drizzle so we can pin explicit createdAt timestamps —
    // repo.save() defers to the column DEFAULT now(), which can collide
    // under fast sequential inserts on pglite.
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await db.insert(notifications).values({
        id: randomUUID(),
        userId: user.id,
        workspaceId: ws.id,
        type: 'RFP_SENT',
        title: `n${i}`,
        body: '',
        channel: 'in_app',
        status: 'sent',
        createdAt: new Date(t0 + i * 1000),
      });
    }

    const rows = await repo.findRecentForUser(user.id, ws.id, 3, 'inapp');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.title)).toEqual(['n4', 'n3', 'n2']);
  });

  it("does not leak other users' notifications", async () => {
    const { db, repo, user, ws } = await setup();
    const other = await seedUser(db);
    await seedMembership(db, ws.id, other.id);
    await repo.save(
      buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }),
    );
    await repo.save(
      buildNotification({ userId: other.id, workspaceId: ws.id, channel: 'inapp' }),
    );

    const rows = await repo.findRecentForUser(user.id, ws.id, 10, 'inapp');
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
  });
});

describe('DrizzleNotificationRepository — workspace isolation', () => {
  it('findRecentForUser: 같은 userId라도 다른 workspaceId 알림은 반환하지 않는다', async () => {
    const { db, repo, user, ws } = await setup();
    const ws2 = await seedBuyerWorkspace(db);
    await seedMembership(db, ws2.id, user.id);

    await repo.save(buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp' }));
    await repo.save(buildNotification({ userId: user.id, workspaceId: ws2.id, channel: 'inapp' }));

    const rowsWs1 = await repo.findRecentForUser(user.id, ws.id, 10);
    expect(rowsWs1).toHaveLength(1);
    expect(rowsWs1[0].workspaceId).toBe(ws.id);

    const rowsWs2 = await repo.findRecentForUser(user.id, ws2.id, 10);
    expect(rowsWs2).toHaveLength(1);
    expect(rowsWs2[0].workspaceId).toBe(ws2.id);
  });

  it('markAllRead: workspaceId 기준으로만 읽음 처리 — 다른 ws 알림은 유지된다', async () => {
    const { db, repo, user, ws } = await setup();
    const ws2 = await seedBuyerWorkspace(db);
    await seedMembership(db, ws2.id, user.id);

    const n1 = buildNotification({ userId: user.id, workspaceId: ws.id, channel: 'inapp', status: 'sent' });
    const n2 = buildNotification({ userId: user.id, workspaceId: ws2.id, channel: 'inapp', status: 'sent' });
    await repo.save(n1);
    await repo.save(n2);

    await repo.markAllRead(user.id, ws.id);

    const ws1Rows = await repo.findRecentForUser(user.id, ws.id, 10);
    expect(ws1Rows[0].status).toBe('read');

    const ws2Rows = await repo.findRecentForUser(user.id, ws2.id, 10);
    expect(ws2Rows[0].status).toBe('sent');
  });
});

describe('DrizzleNotificationRepository — user-level (workspaceId null) notifications', () => {
  function buildUserLevel(
    overrides: Partial<Notification> & {
      userId: string;
      channel: NotificationChannel;
    },
  ): Notification {
    return {
      id: randomUUID(),
      type: 'workspace.invited',
      title: 't',
      body: 'b',
      status: 'sent',
      createdAt: new Date().toISOString(),
      workspaceId: null,
      ...overrides,
    };
  }

  it('findRecentForUser: workspaceId가 null인 알림은 어느 워크스페이스로 조회해도 반환된다', async () => {
    const { db, repo, user, ws } = await setup();
    const ws2 = await seedBuyerWorkspace(db);
    await seedMembership(db, ws2.id, user.id);

    await repo.save(buildUserLevel({ userId: user.id, channel: 'inapp' }));

    const rowsWs1 = await repo.findRecentForUser(user.id, ws.id, 10, 'inapp');
    expect(rowsWs1).toHaveLength(1);
    expect(rowsWs1[0].workspaceId).toBeNull();

    const rowsWs2 = await repo.findRecentForUser(user.id, ws2.id, 10, 'inapp');
    expect(rowsWs2).toHaveLength(1);
    expect(rowsWs2[0].workspaceId).toBeNull();
  });

  it('findRecentForUser: 다른 유저의 user-level 알림은 반환하지 않는다', async () => {
    const { db, repo, user, ws } = await setup();
    const other = await seedUser(db);

    await repo.save(buildUserLevel({ userId: other.id, channel: 'inapp' }));

    const rows = await repo.findRecentForUser(user.id, ws.id, 10, 'inapp');
    expect(rows).toHaveLength(0);
  });

  it('markAllRead: user-level(null) 알림도 읽음 처리된다', async () => {
    const { repo, user, ws } = await setup();
    await repo.save(buildUserLevel({ userId: user.id, channel: 'inapp', status: 'sent' }));

    await repo.markAllRead(user.id, ws.id);

    const rows = await repo.findRecentForUser(user.id, ws.id, 10, 'inapp');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('read');
  });
});
