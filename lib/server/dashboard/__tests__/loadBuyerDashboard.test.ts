import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { rfps, users, workspaces, workspaceMembers } from '@/lib/db/schema';
import { __resetForTest, __useDrizzleWithDbForTest, getSigningContractRepo } from '@/lib/server/repositories/factory';
import { seedBuyerWorkspace, seedPgWorkspace, seedMembership, seedRfp, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import type { SigningContract } from '@/lib/types/signing';
import { loadBuyerDashboard } from '../loadDashboard';

const authState = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock('@/auth', () => ({ auth: () => authState.session }));

let db: PgliteDB;
let buyer: Awaited<ReturnType<typeof seedUser>>;
let workspace: Awaited<ReturnType<typeof seedBuyerWorkspace>>;
beforeEach(async () => {
  vi.stubEnv('MASTER_ACCOUNT_EMAILS', '');
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  buyer = await seedUser(db);
  workspace = await seedBuyerWorkspace(db);
  await seedMembership(db, workspace.id, buyer.id);
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, buyer.id));
  authState.session = {
    expires: '2099-01-01',
    user: { id: buyer.id, email: buyer.email, workspaceId: workspace.id, workspaceType: 'buyer', role: 'member', sessionVersion: 1 },
  };
});
afterEach(() => { __resetForTest(); vi.unstubAllEnvs(); authState.session = null; });

async function agreement(workspaceId: string, overrides: Partial<SigningContract> = {}, awarded = true) {
  const rfp = await seedRfp(db, { buyerWsId: workspaceId, createdBy: buyer.id });
  await db.update(rfps).set({ status: awarded ? 'awarded' : 'closed' }).where(eq(rfps.id, rfp.id));
  const contract: SigningContract = {
    id: randomUUID(), rfpId: rfp.id, kind: 'platform_buyer', status: 'awaiting_pg_template',
    round: 1, createdBy: buyer.id, createdAt: new Date().toISOString(), ...overrides,
  };
  await (await getSigningContractRepo()).create(contract, []);
  return { rfp, contract };
}

describe('구매사 홈 합의서 상태 조회', () => {
  it('현재 구매사의 선정된 노온 합의서 최신 상태만 읽고 민감 필드는 전달하지 않는다', async () => {
    const other = await seedBuyerWorkspace(db);
    const draft = await agreement(workspace.id);
    const sent = await agreement(workspace.id, { status: 'in_progress', providerRef: 'private-provider-ref' });
    const completed = await agreement(workspace.id, { status: 'canceled' });
    const repo = await getSigningContractRepo();
    // 최신 완료가 이전 미완료를 덮어야 한다. 이후 생성된 레거시 행도 노출하지 않는다.
    await repo.create({ ...completed.contract, id: randomUUID(), round: 2, status: 'completed' }, []);
    await repo.create({ ...completed.contract, id: randomUUID(), round: 3, kind: 'pg_buyer', status: 'expired' }, []);
    await agreement(other.id);
    await agreement(workspace.id, { kind: 'pg_buyer' });
    await agreement(workspace.id, {}, false);

    const statuses = await repo.findPlatformStatusesByBuyerWs(workspace.id);
    expect(statuses).toHaveLength(3);
    expect(statuses).toContainEqual({ rfpId: sent.rfp.id, status: 'in_progress', hasProviderRef: true });
    expect(statuses).toContainEqual({ rfpId: completed.rfp.id, status: 'completed', hasProviderRef: false });
    expect(statuses.every(row => Object.keys(row).sort().join(',') === 'hasProviderRef,rfpId,status')).toBe(true);
    const dashboard = await loadBuyerDashboard(workspace.id);
    expect(dashboard.groups.flatMap(g => g.items.map(i => i.id)).sort()).toEqual([draft.rfp.id, sent.rfp.id].sort());
    expect(JSON.stringify(dashboard)).not.toContain('private-provider-ref');
  });

  it('세션의 구매사와 다른 워크스페이스를 조회할 수 없다', async () => {
    const other = await seedBuyerWorkspace(db);
    await expect(loadBuyerDashboard(other.id)).rejects.toThrow('FORBIDDEN_BUYER');
  });

  it('JWT가 남아 있어도 탈퇴한 구매사 멤버의 조회를 차단한다', async () => {
    await agreement(workspace.id);
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, buyer.id));
    await expect(loadBuyerDashboard(workspace.id)).rejects.toThrow('FORBIDDEN_BUYER');
  });

  it('DB에서 비활성화한 구매사의 조회를 차단한다', async () => {
    await db.update(workspaces).set({ status: 'suspended' }).where(eq(workspaces.id, workspace.id));
    await expect(loadBuyerDashboard(workspace.id)).rejects.toThrow('WORKSPACE_INACTIVE');
  });

  it('PG 워크스페이스는 낡은 buyer 타입 세션으로도 조회할 수 없다', async () => {
    const pg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, pg.id, buyer.id);
    authState.session!.user.workspaceId = pg.id;
    await expect(loadBuyerDashboard(pg.id)).rejects.toThrow('FORBIDDEN_BUYER');
  });

  it('철회된 세션을 거절한다', async () => {
    await db.update(users).set({ sessionVersion: 2 }).where(eq(users.id, buyer.id));
    await expect(loadBuyerDashboard(workspace.id)).rejects.toThrow('UNAUTHENTICATED');
    authState.session = null;
    await expect(loadBuyerDashboard(workspace.id)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('기존 Google 운영자 진입은 활성 구매사에서 유지한다', async () => {
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', buyer.email);
    authState.session!.user.authProvider = 'google';
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, buyer.id));
    const { rfp } = await agreement(workspace.id);
    expect((await loadBuyerDashboard(workspace.id)).groups[0].items[0].id).toBe(rfp.id);
  });
});
