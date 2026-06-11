import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { rfps, bids, workspaces } from '@/lib/db/schema';
import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';
import { OnboardingService } from '../onboarding';

let db: PgliteDB;
let svc: OnboardingService;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  svc = new OnboardingService(db);
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
