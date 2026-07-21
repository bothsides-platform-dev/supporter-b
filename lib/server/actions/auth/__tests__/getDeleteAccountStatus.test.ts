import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedPgWorkspace,
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: {
  value: { user: { id: string; workspaceId: string | null } } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { getDeleteAccountStatus } from '../getDeleteAccountStatus';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  sessionRef.value = null;
});

afterEach(() => {
  __setActionDbForTest(undefined);
  __resetForTest();
});

describe('getDeleteAccountStatus', () => {
  it('returns UNAUTHENTICATED when no session', async () => {
    const r = await getDeleteAccountStatus();
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns empty lists when user has no memberships', async () => {
    const user = await seedUser(db, { email: 'solo@example.com' });
    sessionRef.value = { user: { id: user.id, workspaceId: null } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({ ok: true, blockingWorkspaces: [], soloWorkspaces: [] });
  });

  it('returns workspace in soloWorkspaces when user is sole member', async () => {
    const ws = await seedPgWorkspace(db, '내 워크스페이스');
    const user = await seedUser(db, { email: 'only@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [{ id: ws.id, name: '내 워크스페이스' }],
    });
  });

  it('does NOT count a pending-approval admin as another admin (sole approved admin is blocked)', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '구매사P' });
    const admin = await seedUser(db, { email: 'soleadmin@example.com' });
    const pendingAdmin = await seedUser(db, { email: 'pendingadmin@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, pendingAdmin.id, 'admin', { approvalStatus: 'pending_approval' });
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      // 남은 멤버가 승인 대기 admin 뿐 — 권한을 넘길 상대가 없으므로 안내가 갈린다.
      blockingWorkspaces: [{ id: ws.id, name: '구매사P', hasDelegatableMember: false }],
      soloWorkspaces: [],
    });
  });

  it('returns workspace in blockingWorkspaces when user is last admin with other members', async () => {
    const ws = await seedBuyerWorkspace(db, { name: '구매사A' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const member = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [{ id: ws.id, name: '구매사A', hasDelegatableMember: true }],
      soloWorkspaces: [],
    });
  });

  it('does NOT block when there is another admin in the workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const user = await seedUser(db, { email: 'a@example.com' });
    const other = await seedUser(db, { email: 'b@example.com' });
    await seedMembership(db, ws.id, user.id, 'admin');
    await seedMembership(db, ws.id, other.id, 'admin');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
  });

  it('does NOT block when user is a plain member in a multi-member workspace', async () => {
    const ws = await seedPgWorkspace(db, 'PG워크스페이스');
    const user = await seedUser(db, { email: 'member@example.com' });
    const admin = await seedUser(db, { email: 'admin@example.com' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, user.id, 'member');
    sessionRef.value = { user: { id: user.id, workspaceId: ws.id } };

    const r = await getDeleteAccountStatus();
    expect(r).toEqual({
      ok: true,
      blockingWorkspaces: [],
      soloWorkspaces: [],
    });
  });
});
