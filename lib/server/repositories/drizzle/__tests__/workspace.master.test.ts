// WorkspaceRepo.listAllWorkspacesForMaster — every ACTIVE workspace as a
// synthetic admin membership, for the master/operator switcher.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { workspaces } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedPgWorkspace } from './_seed';
import { DrizzleWorkspaceRepository } from '../workspace';

let db: PgliteDB;
let repo: DrizzleWorkspaceRepository;
beforeEach(async () => {
  db = await createPgliteDb();
  repo = new DrizzleWorkspaceRepository(db);
});

describe('DrizzleWorkspaceRepository.listAllWorkspacesForMaster', () => {
  it('모든 active 워크스페이스를 role:admin, unreadCount:0으로 반환한다', async () => {
    const buyer = await seedBuyerWorkspace(db, { name: '구매사A' });
    const pg = await seedPgWorkspace(db, 'PG-B');

    const list = await repo.listAllWorkspacesForMaster();

    expect(list).toHaveLength(2);
    expect(list).toEqual(
      expect.arrayContaining([
        { id: buyer.id, name: '구매사A', type: 'buyer', role: 'admin', status: 'active', unreadCount: 0, logoUpdatedAt: null, memberApprovalStatus: 'approved' },
        { id: pg.id, name: 'PG-B', type: 'pg', role: 'admin', status: 'active', unreadCount: 0, logoUpdatedAt: null, memberApprovalStatus: 'approved' },
      ]),
    );
  });

  it('pending·suspended 워크스페이스는 제외한다', async () => {
    await seedBuyerWorkspace(db, { name: '활성' });
    await db.insert(workspaces).values({ id: randomUUID(), type: 'buyer', name: '심사중', status: 'pending' });
    await db.insert(workspaces).values({ id: randomUUID(), type: 'pg', name: '정지', status: 'suspended' });

    const list = await repo.listAllWorkspacesForMaster();

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('활성');
  });

  it('active 워크스페이스가 없으면 빈 배열', async () => {
    expect(await repo.listAllWorkspacesForMaster()).toEqual([]);
  });

  it('PG 워크스페이스를 구매사보다 먼저, 각 그룹 내부는 이름순으로 정렬한다', async () => {
    // 이름순만 적용하면 'aaa-buyer'가 맨 앞에 와야 하지만, 타입 우선이면 PG 그룹이 먼저 와야 한다.
    await seedBuyerWorkspace(db, { name: 'aaa-buyer' });
    await seedPgWorkspace(db, 'zzz-pg');
    await seedPgWorkspace(db, 'bbb-pg');

    const list = await repo.listAllWorkspacesForMaster();

    expect(list.map((w) => w.name)).toEqual(['bbb-pg', 'zzz-pg', 'aaa-buyer']);
  });
});
