import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { rfps, bids, workspaces, rfpInvitations } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';
import { seedSamplePgRfpInTx } from '@/lib/server/onboarding/sample-pg-rfp';
import { OnboardingService } from '../onboarding';

let db: PgliteDB;
let svc: OnboardingService;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  svc = new OnboardingService(db);
});

afterEach(() => {
  __resetForTest();
});

async function seedSample(): Promise<{ wsId: string; userId: string; code: string }> {
  const u = await seedUser(db);
  const ws = await seedBuyerWorkspace(db);
  const r = await db.transaction((tx) => seedSampleRfpInTx(tx, { buyerWsId: ws.id, buyerUserId: u.id }));
  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
  return { wsId: ws.id, userId: u.id, code: rfp.code };
}

describe('OnboardingService.deleteSampleRfp', () => {
  it('hard-deletes the sample + cascades bids, keeps sampleSeededAt', async () => {
    const s = await seedSample();
    const res = await svc.deleteSampleRfp(s.code, { userId: s.userId, workspaceId: s.wsId });
    expect(res.ok).toBe(true);
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(0);
    expect(await db.select().from(bids)).toHaveLength(0);
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, s.wsId));
    expect(w.sampleSeededAt).not.toBeNull(); // 재시드 안 함
  });

  it('refuses a non-sample RFP (NOT_SAMPLE)', async () => {
    const u = await seedUser(db);
    const ws = await seedBuyerWorkspace(db);
    const code = 'P-2606-REAL1';
    await db.insert(rfps).values({
      id: randomUUID(), code, buyerWsId: ws.id, title: 'real',
      deadline: new Date(Date.now() + 1000), createdBy: u.id, isSample: false,
    });
    const res = await svc.deleteSampleRfp(code, { userId: u.id, workspaceId: ws.id });
    expect(res).toEqual({ ok: false, error: 'NOT_SAMPLE' });
    expect(await db.select().from(rfps).where(eq(rfps.code, code))).toHaveLength(1);
  });

  it('refuses another workspace\'s sample (FORBIDDEN)', async () => {
    const s = await seedSample();
    const res = await svc.deleteSampleRfp(s.code, { userId: s.userId, workspaceId: randomUUID() });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(1);
  });
});

async function seedPgSample(): Promise<{ pgWsId: string; userId: string; code: string }> {
  const u = await seedUser(db);
  const pg = await seedPgWorkspace(db, 'PG샘플');
  const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
  return { pgWsId: pg.id, userId: u.id, code: rfp.code };
}

async function submitBidFor(code: string, pgWsId: string, userId: string): Promise<void> {
  const [rfp] = await db.select().from(rfps).where(eq(rfps.code, code));
  const [inv] = await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, rfp.id));
  await db.insert(bids).values({
    id: randomUUID(),
    rfpId: rfp.id,
    pgWsId,
    invitationId: inv.id,
    settleCycle: 'D+1',
    status: 'submitted',
    submittedBy: userId,
  });
}

describe('OnboardingService.simulateSampleAward', () => {
  it('awards the PG sample to the caller PG submitted bid', async () => {
    const s = await seedPgSample();
    await submitBidFor(s.code, s.pgWsId, s.userId);
    const res = await svc.simulateSampleAward(s.code, { userId: s.userId, workspaceId: s.pgWsId });
    expect(res.ok).toBe(true);
    const [rfp] = await db.select().from(rfps).where(eq(rfps.code, s.code));
    expect(rfp.status).toBe('awarded');
  });

  it('refuses a caller PG that is not the invited sample PG', async () => {
    const s = await seedPgSample();
    await submitBidFor(s.code, s.pgWsId, s.userId);
    const res = await svc.simulateSampleAward(s.code, { userId: s.userId, workspaceId: randomUUID() });
    expect(res.ok).toBe(false);
  });
});

describe('OnboardingService.deleteSamplePgRfp', () => {
  it('hard-deletes the PG sample for the invited PG', async () => {
    const s = await seedPgSample();
    const res = await svc.deleteSamplePgRfp(s.code, { userId: s.userId, workspaceId: s.pgWsId });
    expect(res.ok).toBe(true);
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(0);
  });

  it('refuses another workspace (FORBIDDEN)', async () => {
    const s = await seedPgSample();
    const res = await svc.deleteSamplePgRfp(s.code, { userId: s.userId, workspaceId: randomUUID() });
    expect(res).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(await db.select().from(rfps).where(eq(rfps.code, s.code))).toHaveLength(1);
  });
});

describe('OnboardingService.mark', () => {
  it('stamps completedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerSample?.completedAt).toBeTruthy();
    expect(onboarding.buyerSample?.dismissedAt).toBeUndefined();
  });

  it('stamps dismissedAt on the given key', async () => {
    const u = await seedUser(db);
    const res = await svc.mark({ userId: u.id }, 'pgSample', 'dismissed');
    expect(res.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.pgSample?.dismissedAt).toBeTruthy();
  });

  it('is idempotent — marking the same key/event twice keeps a single stamp shape', async () => {
    const u = await seedUser(db);
    await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    const res2 = await svc.mark({ userId: u.id }, 'buyerSample', 'completed');
    expect(res2.ok).toBe(true);

    const { DrizzleUserRepository } = await import('@/lib/server/repositories/drizzle/user');
    const userRepo = new DrizzleUserRepository(db);
    const onboarding = await userRepo.getOnboarding(u.id);
    expect(onboarding.buyerSample?.completedAt).toBeTruthy();
  });
});
