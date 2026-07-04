import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { notifications, outboxEntries } from '@/lib/db/schema';
import { seedUser, seedBuyerWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { notify } from '../notify';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
});

describe('notify()', () => {
  it('channels:[inapp] → notifications row만, outbox 없음, 생성 알림 반환', async () => {
    const u = await seedUser(db, { email: 'a@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: ['inapp'],
        type: 'rfp.awarded',
        title: 't',
        body: 'b',
        linkUrl: '/inbox/X',
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(1);
    expect(notifRows[0].channel).toBe('in_app');
    expect(notifRows[0].userId).toBe(u.id);
    expect(notifRows[0].linkUrl).toBe('/inbox/X');
    expect(outboxRows).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(created[0].channel).toBe('inapp');
  });

  it('channels:[email] → outbox 엔트리만, notifications 없음, 반환 빈 배열', async () => {
    const u = await seedUser(db, { email: 'b@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: ['email'],
        type: 'bid.submitted',
        title: 't',
        body: 'b',
        email: {
          event: 'bid.submitted',
          subject: 's',
          html: '<p>h</p>',
          dedupeKey: (e) => `k:${e}`,
        },
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(0);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].toAddr).toBe('b@x.com');
    expect(outboxRows[0].dedupeKey).toBe('k:b@x.com');
    expect(created).toHaveLength(0);
  });

  it('channels:[inapp,email] 다중 recipient → 각자 row+outbox, dedupeKey는 수신자별', async () => {
    const u1 = await seedUser(db, { email: 'c1@x.com' });
    const u2 = await seedUser(db, { email: 'c2@x.com' });
    const ws1 = await seedBuyerWorkspace(db);
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [
          { userId: u1.id, workspaceId: ws1.id, email: u1.email },
          { userId: u2.id, workspaceId: ws1.id, email: u2.email },
        ],
        channels: ['inapp', 'email'],
        type: 'rfp.awarded',
        title: 't',
        body: 'b',
        email: {
          event: 'rfp.awarded',
          subject: 's',
          html: '<p>h</p>',
          dedupeKey: (e) => `rfp:1:awarded:${e}`,
        },
      }),
    );
    const notifRows = await db.select().from(notifications);
    const outboxRows = await db.select().from(outboxEntries);
    expect(notifRows).toHaveLength(2);
    expect(outboxRows).toHaveLength(2);
    expect(created).toHaveLength(2);
    expect(outboxRows.map((r) => r.dedupeKey).sort()).toEqual([
      'rfp:1:awarded:c1@x.com',
      'rfp:1:awarded:c2@x.com',
    ]);
  });

  it('channels:[] → no-op (row·outbox 모두 없음, 빈 배열 반환)', async () => {
    const u = await seedUser(db, { email: 'd@x.com' });
    const created = await db.transaction((tx) =>
      notify(tx, {
        recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
        channels: [],
        type: 't',
        title: 't',
        body: 'b',
      }),
    );
    expect(await db.select().from(notifications)).toHaveLength(0);
    expect(await db.select().from(outboxEntries)).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('email 채널인데 email 페이로드 없으면 throw', async () => {
    const u = await seedUser(db, { email: 'e@x.com' });
    await expect(
      db.transaction((tx) =>
        notify(tx, {
          recipients: [{ userId: u.id, workspaceId: null, email: u.email }],
          channels: ['email'],
          type: 't',
          title: 't',
          body: 'b',
        }),
      ),
    ).rejects.toThrow(/email/);
  });
});
