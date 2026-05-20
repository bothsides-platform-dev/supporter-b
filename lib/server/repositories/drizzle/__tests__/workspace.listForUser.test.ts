// WorkspaceRepo.listForUser — lean projection for the workspace switcher:
// every workspace a user belongs to, with the user's role in each.
import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
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
        { id: wsBuyer.id, name: '구매사A', type: 'buyer', role: 'admin' },
        { id: wsPg.id, name: 'PG-B', type: 'pg', role: 'member' },
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
});
