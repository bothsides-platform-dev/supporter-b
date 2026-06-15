// Active-workspace resolution helpers shared by login (authorize) and the
// runtime switch action.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getMembership, resolveInitialMembership } from '../active-workspace';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
  // DB access now routes through the repo factory — bind it to this pglite db.
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
});

describe('getMembership', () => {
  it('returns workspaceId+role+type for an existing membership', async () => {
    const u = await seedUser(db);
    const ws = await seedPgWorkspace(db, 'PG-A');
    await seedMembership(db, ws.id, u.id, 'member');
    const m = await getMembership(u.id, ws.id);
    expect(m).toEqual({ workspaceId: ws.id, role: 'member', workspaceType: 'pg' });
  });

  it('returns null when the user is not a member of the workspace', async () => {
    const u = await seedUser(db);
    const ws = await seedPgWorkspace(db, 'PG-A');
    const m = await getMembership(u.id, ws.id);
    expect(m).toBeNull();
  });
});

describe('resolveInitialMembership', () => {
  it('prefers lastActiveWorkspaceId when the user is still a member', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    const wsPg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    await seedMembership(db, wsPg.id, u.id, 'member');
    const m = await resolveInitialMembership(db, u.id, wsPg.id);
    expect(m).toEqual({ workspaceId: wsPg.id, role: 'member', workspaceType: 'pg' });
  });

  it('falls back to the only membership when lastActive is null', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    const m = await resolveInitialMembership(db, u.id, null);
    expect(m).toEqual({ workspaceId: wsBuyer.id, role: 'admin', workspaceType: 'buyer' });
  });

  it('falls back when lastActive points to a workspace the user is not in', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    const m = await resolveInitialMembership(db, u.id, randomUUID());
    expect(m).toEqual({ workspaceId: wsBuyer.id, role: 'admin', workspaceType: 'buyer' });
  });

  it('returns null when the user has no memberships', async () => {
    const u = await seedUser(db);
    const m = await resolveInitialMembership(db, u.id, null);
    expect(m).toBeNull();
  });
});
