// WorkspaceRepo.listForUser — lean projection for the workspace switcher:
// every workspace a user belongs to, with the user's role in each.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { notifications } from '@/lib/db/schema';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedMembership,
} from './_seed';
import { DrizzleWorkspaceRepository } from '../workspace';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('DrizzleWorkspaceRepository.listForUser', () => {
  it('returns every workspace the user belongs to with id, name, type, role', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db, { name: '구매사A' });
    const wsPg = await seedPgWorkspace(db, 'PG-B');
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    await seedMembership(db, wsPg.id, u.id, 'member');

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);

    expect(list).toHaveLength(2);
    expect(list).toEqual(
      expect.arrayContaining([
        { id: wsBuyer.id, name: '구매사A', type: 'buyer', role: 'admin', status: 'active', unreadCount: 0, logoUpdatedAt: null, memberApprovalStatus: 'approved' },
        { id: wsPg.id, name: 'PG-B', type: 'pg', role: 'member', status: 'active', unreadCount: 0, logoUpdatedAt: null, memberApprovalStatus: 'approved' },
      ]),
    );
  });

  it('returns an empty array when the user has no memberships', async () => {
    const u = await seedUser(db);
    const repo = new DrizzleWorkspaceRepository(db);
    expect(await repo.listForUser(u.id)).toEqual([]);
  });

  it('does not include workspaces the user is not a member of', async () => {
    const u = await seedUser(db);
    const mine = await seedPgWorkspace(db, 'Mine');
    await seedMembership(db, mine.id, u.id, 'admin');
    await seedPgWorkspace(db, 'NotMine'); // no membership for u

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: mine.id, name: 'Mine' });
  });

  it('PG 워크스페이스를 구매사보다 먼저, 각 그룹 내부는 이름순으로 정렬한다', async () => {
    const u = await seedUser(db);
    // 가입일 순서(구매사가 먼저 가입)와 타입/이름 정렬 순서가 어긋나도록 시딩한다.
    const buyerB = await seedBuyerWorkspace(db, { name: 'bbb-buyer' });
    await seedMembership(db, buyerB.id, u.id, 'admin', {
      joinedAt: new Date('2020-01-01T00:00:00Z'),
    });
    const pgZ = await seedPgWorkspace(db, 'zzz-pg');
    await seedMembership(db, pgZ.id, u.id, 'member', {
      joinedAt: new Date('2020-02-01T00:00:00Z'),
    });
    const pgA = await seedPgWorkspace(db, 'aaa-pg');
    await seedMembership(db, pgA.id, u.id, 'member', {
      joinedAt: new Date('2020-03-01T00:00:00Z'),
    });

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);

    expect(list.map((w) => w.name)).toEqual(['aaa-pg', 'zzz-pg', 'bbb-buyer']);
  });
});

describe('DrizzleWorkspaceRepository.listForUser — unreadCount', () => {
  it('워크스페이스에 미읽음 inapp 알림이 있으면 unreadCount가 반영된다', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id);
    await db.insert(notifications).values({
      id: randomUUID(),
      userId: u.id,
      workspaceId: ws.id,
      type: 'TEST',
      title: 't',
      body: '',
      channel: 'in_app',
      status: 'sent',
    });

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);
    expect(list[0].unreadCount).toBe(1);
  });

  it('알림이 없으면 unreadCount는 0이다', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id);

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);
    expect(list[0].unreadCount).toBe(0);
  });

  it('읽음 처리된 알림(read_at not null)은 unreadCount에 포함되지 않는다', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, u.id);
    await db.insert(notifications).values({
      id: randomUUID(),
      userId: u.id,
      workspaceId: ws.id,
      type: 'TEST',
      title: 't',
      body: '',
      channel: 'in_app',
      status: 'read',
      readAt: new Date(),
    });

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);
    expect(list[0].unreadCount).toBe(0);
  });

  it('다른 워크스페이스의 알림은 unreadCount에 영향을 주지 않는다', async () => {
    const u = await seedUser(db);
    const wsA = await seedBuyerWorkspace(db, { name: 'A' });
    const wsB = await seedBuyerWorkspace(db, { name: 'B' });
    await seedMembership(db, wsA.id, u.id);
    await seedMembership(db, wsB.id, u.id);
    // wsB에 미읽음 알림 2개
    for (let i = 0; i < 2; i++) {
      await db.insert(notifications).values({
        id: randomUUID(),
        userId: u.id,
        workspaceId: wsB.id,
        type: 'TEST',
        title: 't',
        body: '',
        channel: 'in_app',
        status: 'sent',
      });
    }

    const repo = new DrizzleWorkspaceRepository(db);
    const list = await repo.listForUser(u.id);
    const a = list.find((w) => w.id === wsA.id)!;
    const b = list.find((w) => w.id === wsB.id)!;
    expect(a.unreadCount).toBe(0);
    expect(b.unreadCount).toBe(2);
  });
});
