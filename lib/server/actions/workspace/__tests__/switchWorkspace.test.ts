// switchWorkspaceAction — validate membership, re-derive type+role from the
// TARGET membership, persist lastActiveWorkspaceId, push the new active
// workspace into the JWT via unstable_update, land on /home.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

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
import { users, workspaces } from '@/lib/db/schema';

const sessionRef: { value: { user: { id: string; email?: string } } | null } = { value: null };
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

const { mockHostRef } = vi.hoisted(() => ({ mockHostRef: { value: null as string | null } }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: (_name: string) => mockHostRef.value }),
}));

import { switchWorkspaceAction } from '../switchWorkspaceAction';

let db: PgliteDB;
beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  unstableUpdate.mockClear();
  revalidatePath.mockClear();
  sessionRef.value = null;
});
afterEach(() => {
  __resetForTest();
  mockHostRef.value = null;
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

  describe('master account (env allowlist)', () => {
    const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
    beforeEach(() => {
      process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
    });

    it('마스터는 멤버십 없는 active 워크스페이스로도 전환할 수 있다 (role admin)', async () => {
      const master = await seedUser(db, { email: 'help@support-b.com' });
      const ws = await seedBuyerWorkspace(db); // 멤버십 행 없음
      sessionRef.value = { user: { id: master.id, email: 'help@support-b.com' } };

      const r = await switchWorkspaceAction(ws.id);

      expect(r).toEqual({ ok: true, redirectTo: '/home' });
      expect(unstableUpdate).toHaveBeenCalledWith({
        user: { workspaceId: ws.id, workspaceType: 'buyer', role: 'admin' },
      });
      const [row] = await db.select().from(users).where(eq(users.id, master.id));
      expect(row.lastActiveWorkspaceId).toBe(ws.id);
      expect(revalidatePath).toHaveBeenCalledWith('/home');
    });

    it('allowlist가 아닌 이메일은 멤버십 없으면 NOT_MEMBER (마스터 우회 불가)', async () => {
      const u = await seedUser(db, { email: 'buyer@example.com' });
      const ws = await seedBuyerWorkspace(db);
      sessionRef.value = { user: { id: u.id, email: 'buyer@example.com' } };

      const r = await switchWorkspaceAction(ws.id);

      expect(r).toEqual({ ok: false, error: 'NOT_MEMBER' });
      expect(unstableUpdate).not.toHaveBeenCalled();
    });

    it('마스터는 pending 워크스페이스로 전환할 수 없다 → INVALID_INPUT', async () => {
      const master = await seedUser(db, { email: 'help@support-b.com' });
      const pendingId = randomUUID();
      await db.insert(workspaces).values({ id: pendingId, type: 'buyer', name: '심사중', status: 'pending' });
      sessionRef.value = { user: { id: master.id, email: 'help@support-b.com' } };

      const r = await switchWorkspaceAction(pendingId);

      expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
      expect(unstableUpdate).not.toHaveBeenCalled();
    });

    it('마스터는 존재하지 않는 워크스페이스로 전환할 수 없다 → INVALID_INPUT', async () => {
      const master = await seedUser(db, { email: 'help@support-b.com' });
      sessionRef.value = { user: { id: master.id, email: 'help@support-b.com' } };

      const r = await switchWorkspaceAction(randomUUID());

      expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    });
  });

  it('cross-host: switching to a pg workspace from the buyer host returns an absolute partner URL', async () => {
    const savedBuyer = process.env.NEXT_PUBLIC_BUYER_ORIGIN;
    const savedPartner = process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
    process.env.NEXT_PUBLIC_BUYER_ORIGIN = 'https://support-b.com';
    process.env.NEXT_PUBLIC_PARTNER_ORIGIN = 'https://partner.support-b.com';
    mockHostRef.value = 'support-b.com';

    try {
      const u = await seedUser(db);
      const wsBuyer = await seedBuyerWorkspace(db);
      const wsPg = await seedPgWorkspace(db, 'CrossHostPG');
      await seedMembership(db, wsBuyer.id, u.id, 'admin');
      await seedMembership(db, wsPg.id, u.id, 'member');
      sessionRef.value = { user: { id: u.id } };

      const r = await switchWorkspaceAction(wsPg.id);

      expect(r).toEqual({ ok: true, redirectTo: 'https://partner.support-b.com/home' });
    } finally {
      if (savedBuyer === undefined) delete process.env.NEXT_PUBLIC_BUYER_ORIGIN;
      else process.env.NEXT_PUBLIC_BUYER_ORIGIN = savedBuyer;
      if (savedPartner === undefined) delete process.env.NEXT_PUBLIC_PARTNER_ORIGIN;
      else process.env.NEXT_PUBLIC_PARTNER_ORIGIN = savedPartner;
    }
  });
});
