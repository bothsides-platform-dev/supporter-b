// switchWorkspaceAction — validate membership, re-derive type+role from the
// TARGET membership, persist lastActiveWorkspaceId, push the new active
// workspace into the JWT via unstable_update, land on /home.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedUser,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { users } from '@/lib/db/schema';

const sessionRef: { value: { user: { id: string } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

const unstableUpdate = vi.fn();
vi.mock('@/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unstable_update: (...args: any[]) => unstableUpdate(...args),
}));

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revalidatePath: (...args: any[]) => revalidatePath(...args),
}));

import { switchWorkspaceAction } from '../switchWorkspaceAction';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
  __setActionDbForTest(db);
  unstableUpdate.mockClear();
  revalidatePath.mockClear();
  sessionRef.value = null;
});
afterEach(() => {
  __setActionDbForTest(undefined);
});

describe('switchWorkspaceAction', () => {
  it('member: persists lastActive, updates the token with the TARGET type+role, returns /home', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    const wsPg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    await seedMembership(db, wsPg.id, u.id, 'member');
    sessionRef.value = { user: { id: u.id } };

    const r = await switchWorkspaceAction(wsPg.id);

    expect(r).toEqual({ ok: true, redirectTo: '/home' });
    // type/role re-derived from the target membership (pg + member), not the
    // user's other (buyer + admin) membership.
    expect(unstableUpdate).toHaveBeenCalledWith({
      user: { workspaceId: wsPg.id, workspaceType: 'pg', role: 'member' },
    });
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.lastActiveWorkspaceId).toBe(wsPg.id);
  });

  it('non-member of the target: NOT_MEMBER and no token update', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    const other = await seedPgWorkspace(db, 'Other'); // u is not a member
    sessionRef.value = { user: { id: u.id } };

    const r = await switchWorkspaceAction(other.id);

    expect(r).toEqual({ ok: false, error: 'NOT_MEMBER' });
    expect(unstableUpdate).not.toHaveBeenCalled();
  });

  it('unauthenticated: UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const r = await switchWorkspaceAction('any-id');
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(unstableUpdate).not.toHaveBeenCalled();
  });

  it('empty target id: INVALID_INPUT', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };
    const r = await switchWorkspaceAction('');
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(unstableUpdate).not.toHaveBeenCalled();
  });

  it('member: calls revalidatePath("/home") to invalidate RSC cache server-side', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    const wsPg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    await seedMembership(db, wsPg.id, u.id, 'member');
    sessionRef.value = { user: { id: u.id } };

    await switchWorkspaceAction(wsPg.id);

    expect(revalidatePath).toHaveBeenCalledWith('/home');
  });

  it('non-member: does not call revalidatePath', async () => {
    const u = await seedUser(db);
    const wsBuyer = await seedBuyerWorkspace(db);
    await seedMembership(db, wsBuyer.id, u.id, 'admin');
    const other = await seedPgWorkspace(db, 'Other');
    sessionRef.value = { user: { id: u.id } };

    await switchWorkspaceAction(other.id);

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
