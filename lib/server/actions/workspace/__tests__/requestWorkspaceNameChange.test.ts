import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PgliteDB } from '@/lib/db/client-pglite';
import { seedBuyerWorkspace, seedMembership, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setupWorkspaceActionEnv, teardownWorkspaceActionEnv } from './_setup';

const sessionRef: { value: { user: { id: string; email?: string; workspaceId: string | null; role: string | null } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () => sessionRef.value ? Promise.resolve(sessionRef.value) : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { requestWorkspaceNameChangeAction } from '../requestWorkspaceNameChangeAction';

let db: PgliteDB;
beforeEach(async () => {
  db = await setupWorkspaceActionEnv();
  sessionRef.value = null;
});
afterEach(() => teardownWorkspaceActionEnv());

describe('requestWorkspaceNameChangeAction', () => {
  it('승인된 admin의 요청을 접수하지만 현재 이름은 바꾸지 않는다', async () => {
    const admin = await seedUser(db, { email: 'admin@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '기존 이름' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id, role: 'admin' } };

    expect(await requestWorkspaceNameChangeAction({ name: '새 이름' })).toEqual({ ok: true });
    const repo = await getWorkspaceRepo();
    expect(await repo.getName(ws.id)).toBe('기존 이름');
    expect(await repo.findLatestNameChangeRequest(ws.id)).toMatchObject({
      workspaceId: ws.id,
      requestedByUserId: admin.id,
      currentName: '기존 이름',
      requestedName: '새 이름',
      status: 'pending',
    });
  });

  it('대기 중인 요청이 있으면 두 번째 요청을 거부한다', async () => {
    const admin = await seedUser(db, { email: 'admin2@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '기존 이름' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id, role: 'admin' } };

    expect(await requestWorkspaceNameChangeAction({ name: '첫 이름' })).toEqual({ ok: true });
    expect(await requestWorkspaceNameChangeAction({ name: '둘째 이름' })).toEqual({ ok: false, error: 'ALREADY_PENDING' });
    expect(await (await getWorkspaceRepo()).getName(ws.id)).toBe('기존 이름');
  });

  it('일반 멤버의 요청은 거부한다', async () => {
    const member = await seedUser(db, { email: 'member@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '기존 이름' });
    await seedMembership(db, ws.id, member.id, 'member');
    sessionRef.value = { user: { id: member.id, workspaceId: ws.id, role: 'member' } };

    expect(await requestWorkspaceNameChangeAction({ name: '탈취 이름' })).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await (await getWorkspaceRepo()).findLatestNameChangeRequest(ws.id)).toBeUndefined();
  });

  it('정지된 워크스페이스는 직접 호출해도 요청을 만들지 않는다', async () => {
    const admin = await seedUser(db, { email: 'suspended@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '기존 이름' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    await db.update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, ws.id));
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id, role: 'admin' } };

    expect(await requestWorkspaceNameChangeAction({ name: '새 이름' })).toEqual({
      ok: false,
      error: 'WORKSPACE_INACTIVE',
    });
    expect(await (await getWorkspaceRepo()).findLatestNameChangeRequest(ws.id)).toBeUndefined();
  });
});
