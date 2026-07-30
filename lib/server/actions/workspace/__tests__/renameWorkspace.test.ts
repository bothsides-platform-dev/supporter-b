// renameWorkspaceAction tests — 워크스페이스 이름 변경 (admin 전용).
// JWT role 이 아니라 DB 의 승인된 admin 인지로 판정한다 (미승인 admin 차단).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PgliteDB } from '@/lib/db/client-pglite';
import {
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { setupWorkspaceActionEnv, teardownWorkspaceActionEnv } from './_setup';
import { getWorkspaceRepo } from '@/lib/server/repositories/factory';

const sessionRef: {
  value: {
    user: {
      id: string;
      email?: string;
      workspaceId: string | null;
      role: string | null;
    };
  } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { renameWorkspaceAction } from '../renameWorkspaceAction';

let db: PgliteDB;

beforeEach(async () => {
  db = await setupWorkspaceActionEnv();
  sessionRef.value = null;
});

afterEach(() => {
  teardownWorkspaceActionEnv();
});

describe('renameWorkspaceAction', () => {
  it('approved admin 은 이름을 변경한다', async () => {
    const admin = await seedUser(db, { email: 'admin@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '구명' });
    await seedMembership(db, ws.id, admin.id, 'admin');
    sessionRef.value = { user: { id: admin.id, workspaceId: ws.id, role: 'admin' } };

    const r = await renameWorkspaceAction({ name: '새이름' });
    expect(r).toEqual({ ok: true });
    expect(await (await getWorkspaceRepo()).getName(ws.id)).toBe('새이름');
  });

  // 설정 페이지는 세 컨트롤(로고·이름·사업자번호)에 **한 값**(마스터 면제 포함)을
  // 내려 준다. 이 액션만 면제가 없으면 마스터에게 이름 변경 버튼은 보이는데 저장은
  // 항상 FORBIDDEN 인 막다른 길이 된다 — 다른 두 경로는 이미 면제를 갖고 있다.
  it('마스터 계정은 멤버십 row 가 없어도 이름을 변경한다', async () => {
    const prev = process.env.MASTER_ACCOUNT_EMAILS;
    process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
    try {
      const master = await seedUser(db, { email: 'ops@support-b.com' });
      const ws = await seedBuyerWorkspace(db, { name: '구명' });
      // 의도적으로 seedMembership 없음 — 마스터는 synthetic admin 이다.
      sessionRef.value = {
        user: {
          id: master.id,
          email: 'ops@support-b.com',
          workspaceId: ws.id,
          role: 'admin',
        },
      };

      const r = await renameWorkspaceAction({ name: '새이름' });
      expect(r).toEqual({ ok: true });
      expect(await (await getWorkspaceRepo()).getName(ws.id)).toBe('새이름');
    } finally {
      if (prev === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
      else process.env.MASTER_ACCOUNT_EMAILS = prev;
    }
  });

  it('미승인(pending_approval) admin 은 거부한다 (이름 변경 안 됨)', async () => {
    const pending = await seedUser(db, { email: 'pending@rename.com' });
    const ws = await seedBuyerWorkspace(db, { name: '구명' });
    await seedMembership(db, ws.id, pending.id, 'admin', { approvalStatus: 'pending_approval' });
    sessionRef.value = { user: { id: pending.id, workspaceId: ws.id, role: 'admin' } };

    const r = await renameWorkspaceAction({ name: '탈취이름' });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await (await getWorkspaceRepo()).getName(ws.id)).toBe('구명');
  });
});
