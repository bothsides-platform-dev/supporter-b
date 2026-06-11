import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { workspaces, users, rfps, bids, rfpInvitations, rfpAllowedPg } from '@/lib/db/schema';
import {
  seedUser,
  seedPgWorkspace,
  seedBuyerWorkspace,
  seedMembership,
  seedRfp,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  ensureDemoBuyer,
  seedSamplePgRfpInTx,
  simulateSampleAwardInTx,
  deleteSamplePgRfpInTx,
  backfillSamplePgRfps,
} from '../sample-pg-rfp';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

// 시드된 샘플 RFP 에 대해 PG 가 제출한 견적(submitted bid)을 흉내낸다.
async function seedSubmittedBid(rfpId: string, pgWsId: string, userId: string): Promise<string> {
  const [inv] = await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, rfpId));
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId,
    invitationId: inv.id,
    settleCycle: 'D+1',
    status: 'submitted',
    submittedBy: userId,
  });
  return bidId;
}

describe('ensureDemoBuyer', () => {
  it('creates a single demo buyer workspace (isDemo, bizProfile, non-login system user), idempotently', async () => {
    const first = await db.transaction((tx) => ensureDemoBuyer(tx));
    expect(first.wsId).toBeTruthy();
    expect(first.userId).toBeTruthy();

    const second = await db.transaction((tx) => ensureDemoBuyer(tx));
    // same workspace id returned (no duplicate created)
    expect(second.wsId).toBe(first.wsId);

    const demoWs = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    expect(demoWs).toHaveLength(1);
    expect(demoWs[0].type).toBe('buyer');
    expect(demoWs[0].status).toBe('active');
    // 인박스에 등급/사업자 정보가 보이도록 bizProfile 을 매단다
    expect(demoWs[0].bizProfileId).not.toBeNull();

    const sys = await db.select().from(users).where(eq(users.isSystemAccount, true));
    expect(sys).toHaveLength(1);
    // 데모 계정은 절대 인증되지 않아야 한다
    expect(sys[0].passwordHash).toBe('!');
  });
});

describe('seedSamplePgRfpInTx', () => {
  it('seeds 1 demo-buyer-owned sample RFP (sent, boardVisible=false) + accepted invite + allowlist for the PG, NO bid, sets sampleSeededAt', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');

    const r = await db.transaction((tx) =>
      seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }),
    );
    expect(r.seeded).toBe(true);

    const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    expect(rfp.isSample).toBe(true);
    expect(rfp.status).toBe('sent');
    expect(rfp.boardVisible).toBe(false);
    // 소유자는 PG 가 아니라 데모 구매사
    const [demoWs] = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    expect(rfp.buyerWsId).toBe(demoWs.id);

    // bid 는 시드하지 않는다 — PG 가 직접 제출
    expect(await db.select().from(bids).where(eq(bids.rfpId, r.rfpId!))).toHaveLength(0);

    const invRows = await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, r.rfpId!));
    expect(invRows).toHaveLength(1);
    expect(invRows[0].pgWsId).toBe(pg.id);
    expect(invRows[0].status).toBe('accepted');
    expect(invRows[0].acceptedByUserId).toBe(u.id);

    const allow = await db.select().from(rfpAllowedPg).where(eq(rfpAllowedPg.rfpId, r.rfpId!));
    expect(allow).toHaveLength(1);
    expect(allow[0].pgWsId).toBe(pg.id);

    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, pg.id));
    expect(w.sampleSeededAt).not.toBeNull();
  });

  it('is idempotent — second call is a no-op when sampleSeededAt is set', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const second = await db.transaction((tx) =>
      seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }),
    );
    expect(second.seeded).toBe(false);
    // 이 PG 앞으로는 정확히 한 건의 샘플 초대만 존재한다
    const invs = await db.select().from(rfpInvitations).where(eq(rfpInvitations.pgWsId, pg.id));
    expect(invs).toHaveLength(1);
  });
});

describe('simulateSampleAwardInTx', () => {
  it('awards the sample RFP to the PG submitted bid (status=awarded, awardedBidId set)', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const bidId = await seedSubmittedBid(r.rfpId!, pg.id, u.id);
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));

    const res = await db.transaction((tx) =>
      simulateSampleAwardInTx(tx, { code: rfp0.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(true);

    const [rfp] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    expect(rfp.status).toBe('awarded');
    expect(rfp.awardedBidId).toBe(bidId);
  });

  it('refuses a PG that is not the invited sample PG', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    await seedSubmittedBid(r.rfpId!, pg.id, u.id);
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));

    const other = await seedPgWorkspace(db, '다른PG');
    const res = await db.transaction((tx) =>
      simulateSampleAwardInTx(tx, { code: rfp0.code, pgWsId: other.id }),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses a non-sample RFP', async () => {
    const u = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const real = await seedRfp(db, { buyerWsId: buyer.id, createdBy: u.id });
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const res = await db.transaction((tx) =>
      simulateSampleAwardInTx(tx, { code: real.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(false);
  });

  it('refuses when there is no submitted bid yet', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    const res = await db.transaction((tx) =>
      simulateSampleAwardInTx(tx, { code: rfp0.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(false);
  });

  it('is tolerant of a double award (returns ok)', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    await seedSubmittedBid(r.rfpId!, pg.id, u.id);
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));
    await db.transaction((tx) => simulateSampleAwardInTx(tx, { code: rfp0.code, pgWsId: pg.id }));
    const res = await db.transaction((tx) =>
      simulateSampleAwardInTx(tx, { code: rfp0.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(true);
  });
});

describe('deleteSamplePgRfpInTx', () => {
  it('hard-deletes the sample RFP (cascades invite + allowlist) for the invited PG', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));

    const res = await db.transaction((tx) =>
      deleteSamplePgRfpInTx(tx, { code: rfp0.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(true);
    expect(await db.select().from(rfps).where(eq(rfps.id, r.rfpId!))).toHaveLength(0);
    expect(await db.select().from(rfpInvitations).where(eq(rfpInvitations.rfpId, r.rfpId!))).toHaveLength(0);
    expect(await db.select().from(rfpAllowedPg).where(eq(rfpAllowedPg.rfpId, r.rfpId!))).toHaveLength(0);
  });

  it('refuses a PG that is not the invited sample PG (no delete)', async () => {
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    const r = await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const [rfp0] = await db.select().from(rfps).where(eq(rfps.id, r.rfpId!));

    const other = await seedPgWorkspace(db, '다른PG');
    const res = await db.transaction((tx) =>
      deleteSamplePgRfpInTx(tx, { code: rfp0.code, pgWsId: other.id }),
    );
    expect(res.ok).toBe(false);
    expect(await db.select().from(rfps).where(eq(rfps.id, r.rfpId!))).toHaveLength(1);
  });

  it('refuses a non-sample RFP even if the PG is allowed on it', async () => {
    const u = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    const real = await seedRfp(db, { buyerWsId: buyer.id, createdBy: u.id });
    const pg = await seedPgWorkspace(db, 'PG샘플');
    await db.insert(rfpAllowedPg).values({ rfpId: real.id, pgWsId: pg.id });

    const res = await db.transaction((tx) =>
      deleteSamplePgRfpInTx(tx, { code: real.code, pgWsId: pg.id }),
    );
    expect(res.ok).toBe(false);
    expect(await db.select().from(rfps).where(eq(rfps.id, real.id))).toHaveLength(1);
  });
});

describe('backfillSamplePgRfps', () => {
  it('seeds samples for pg workspaces without one, idempotently, skipping buyer', async () => {
    const pu = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG백필');
    await seedMembership(db, pg.id, pu.id, 'admin');

    const bu = await seedUser(db);
    const buyer = await seedBuyerWorkspace(db);
    await seedMembership(db, buyer.id, bu.id, 'admin');

    const first = await backfillSamplePgRfps(db);
    expect(first.seeded).toBe(1);
    expect(await db.select().from(rfpInvitations).where(eq(rfpInvitations.pgWsId, pg.id))).toHaveLength(1);

    const second = await backfillSamplePgRfps(db);
    expect(second.seeded).toBe(0); // 멱등
  });

  it('skips demo PG workspaces (never seeds onboarding samples into demo workspaces)', async () => {
    const { ensureDemoPgs } = await import('@/lib/server/onboarding/sample-rfp');
    // 데모 PG 3사(type=pg, isDemo, admin 멤버 보유)를 미리 만든다 — 구매사 샘플이 쓰는 비더들.
    await db.transaction((tx) => ensureDemoPgs(tx));

    const res = await backfillSamplePgRfps(db);
    expect(res.seeded).toBe(0);

    const demoWs = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    for (const w of demoWs) {
      expect(await db.select().from(rfpInvitations).where(eq(rfpInvitations.pgWsId, w.id))).toHaveLength(0);
    }
  });
});

describe('cross-feature: buyer backfill never targets the shared demo buyer', () => {
  it('backfillSampleRfps (buyer) skips the demo buyer workspace', async () => {
    // PG 샘플 시드의 부수효과로 데모 구매사가 생긴다.
    const u = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG샘플');
    await db.transaction((tx) => seedSamplePgRfpInTx(tx, { pgWsId: pg.id, pgUserId: u.id }));
    const [demoBuyer] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.isDemo, true), eq(workspaces.type, 'buyer')));

    const { backfillSampleRfps } = await import('@/lib/server/onboarding/sample-rfp');
    await backfillSampleRfps(db);

    // 데모 구매사는 온보딩 샘플 대상이 아니다 — sampleSeededAt 미설정, 추가 RFP 없음
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, demoBuyer.id));
    expect(w.sampleSeededAt).toBeNull();
    // 데모 구매사가 소유한 RFP 는 자신이 보낸 PG 샘플 1건뿐
    expect(await db.select().from(rfps).where(eq(rfps.buyerWsId, demoBuyer.id))).toHaveLength(1);
  });
});
