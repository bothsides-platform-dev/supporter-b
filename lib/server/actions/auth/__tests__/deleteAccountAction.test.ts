import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedPgWorkspace,
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';

const sessionRef: {
  value: { user: { id: string; workspaceId: string | null; isMaster?: boolean } } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

const verifyPasswordMock = vi.fn<(plain: string, hash: string) => Promise<boolean>>();
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: (plain: string, hash: string) => verifyPasswordMock(plain, hash),
}));

import { deleteAccountAction } from '../deleteAccountAction';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  sessionRef.value = null;
  verifyPasswordMock.mockReset();
});

afterEach(() => {
  __resetForTest();
});

async function isDeleted(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId));
  return row?.deletedAt != null;
}

async function isMember(wsId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, wsId));
  return rows.some((r) => r.userId === userId);
}

async function workspaceExists(wsId: string): Promise<boolean> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, wsId));
  return rows.length > 0;
}

describe('deleteAccountAction', () => {
  it('returns UNAUTHENTICATED when no session', async () => {
    const r = await deleteAccountAction({ password: 'pw' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('마스터 계정은 삭제할 수 없다 → MASTER_ACCOUNT (비밀번호가 맞아도)', async () => {
    const user = await seedUser(db, { email: 'master@example.com' });
    sessionRef.value = { user: { id: user.id, workspaceId: null, isMaster: true } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });

    expect(r).toEqual({ ok: false, error: 'MASTER_ACCOUNT' });
    expect(await isDeleted(user.id)).toBe(false);
  });

  it('returns INVALID_PASSWORD when password is wrong', async () => {
    const user = await seedUser(db, { email: 'u@example.com' });
    sessionRef.value = { user: { id: user.id, workspaceId: null } };
    verifyPasswordMock.mockResolvedValue(false);

    const r = await deleteAccountAction({ password: 'wrong' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(await isDeleted(user.id)).toBe(false);
  });

  it('returns LAST_ADMIN when user is the only admin in a workspace with other members', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '구매사A' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({
      ok: false,
      error: 'LAST_ADMIN',
      blockingWorkspaces: [{ id: ws.id, name: '구매사A', hasDelegatableMember: true }],
    });
    expect(await isDeleted(admin.id)).toBe(false);
    expect(await isMember(ws.id, admin.id)).toBe(true);
  });

  it('soft-deletes user who is a plain member (non-admin) in a workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: member.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(member.id)).toBe(true);
    expect(await isMember(ws.id, member.id)).toBe(false);
    expect(await isMember(ws.id, admin.id)).toBe(true);
  });

  it('soft-deletes user who is admin when another admin exists', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const adminA = await seedUser(db, { email: 'a@example.com' });
    const adminB = await seedUser(db, { email: 'b@example.com' });
    await seedMembership(db, ws.id, adminA.id, 'admin');
    await seedMembership(db, ws.id, adminB.id, 'admin');
    sessionRef.value = { user: { id: adminA.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(adminA.id)).toBe(true);
    expect(await isMember(ws.id, adminA.id)).toBe(false);
    expect(await isMember(ws.id, adminB.id)).toBe(true);
  });

  it('deletes solo workspace (sole member) when user withdraws', async () => {
    const ws = await seedPgWorkspace(db, '내 워크스페이스');
    const user = await seedUser(db, { email: 'owner@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(user.id)).toBe(true);
    expect(await workspaceExists(ws.id)).toBe(false);
  });

  it('removes all memberships across multiple workspaces', async () => {
    const ws1 = await seedPgWorkspace(db, 'WS1');
    const ws2 = await seedBuyerWorkspace(db, { name: 'WS2' });
    const user = await seedUser(db, { email: 'multi@example.com' });
    const otherAdmin1 = await seedUser(db, { email: 'oa1@example.com' });
    const otherAdmin2 = await seedUser(db, { email: 'oa2@example.com' });
    await seedMembership(db, ws1.id, user.id, 'admin');
    await seedMembership(db, ws1.id, otherAdmin1.id, 'admin');
    await seedMembership(db, ws2.id, user.id, 'member');
    await seedMembership(db, ws2.id, otherAdmin2.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws1.id } };
    verifyPasswordMock.mockResolvedValue(true);

    const r = await deleteAccountAction({ password: 'correct' });
    expect(r).toEqual({ ok: true });
    expect(await isDeleted(user.id)).toBe(true);
    expect(await isMember(ws1.id, user.id)).toBe(false);
    expect(await isMember(ws2.id, user.id)).toBe(false);
  });
});
