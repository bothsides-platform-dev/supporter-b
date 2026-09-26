/**
 * Opt-in, real PostgreSQL row-lock regression tests.
 * Run only against the disposable local test database, never an application DB:
 * RUN_REAL_PG_DEADLINE_RACES=1 DEADLINE_RACE_DATABASE_URL=postgres://...@127.0.0.1:5433/supporter_b_test \
 *   pnpm test lib/server/services/__tests__/deadline-races.postgres.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { bids, businessCalendarYears, pgMatchingPolicies, pgRecommendationGroups, rfpInvitations, rfpMatchingRequests, rfpPgReviews, rfps, users, workspaces } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { businessDeadline } from '@/lib/rfp/business-deadline';
import { seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedRfp, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { __resetForTest, __useDrizzleWithDbForTest, getBusinessCalendarRepo, getRfpRepo } from '@/lib/server/repositories/factory';
import { getBidService } from '../bid';
import { getPgMatchingService } from '../pg-matching';
import { getRfpService } from '../rfp';

vi.mock('@/lib/server/outbox/post-commit', () => ({ flushAfterCommit: vi.fn() }));
vi.mock('@/lib/server/notifications/dispatch', async (importOriginal) => ({
  ...await importOriginal<object>(), emitAfterCommit: vi.fn(),
}));
vi.mock('@/lib/server/notifications/operator-rfp', () => ({ notifyRfpOperator: vi.fn() }));

const enabled = process.env.RUN_REAL_PG_DEADLINE_RACES === '1';
const connectionUrl = process.env.DEADLINE_RACE_DATABASE_URL;

function assertDisposableDatabase(value: string | undefined): asserts value is string {
  if (!value) throw new Error('DEADLINE_RACE_DATABASE_URL is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid DEADLINE_RACE_DATABASE_URL'); }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '5433' || url.pathname !== '/supporter_b_test' ||
    url.search || url.hash
  ) throw new Error('Race tests require localhost:5433/supporter_b_test');
}

type Fixture = {
  rfpId: string;
  buyer: { userId: string; workspaceId: string };
  pg: { userId: string; workspaceId: string };
  invitationId: string;
  userIds: string[];
  workspaceIds: string[];
  groupIds: string[];
};

describe.skipIf(!enabled)('real PostgreSQL deadline races', () => {
  let client: ReturnType<typeof postgres>;
  let db: DB;
  let fixture: Fixture | undefined;
  const createdCalendarYears: number[] = [];
  const priorFlag = process.env.BUSINESS_DEADLINES_ENABLED;

  beforeAll(async () => {
    assertDisposableDatabase(connectionUrl);
    client = postgres(connectionUrl, { max: 6, connect_timeout: 5, idle_timeout: 5 });
    db = drizzle(client, { schema, casing: 'snake_case' });
    __resetForTest();
    await __useDrizzleWithDbForTest(db);
    process.env.BUSINESS_DEADLINES_ENABLED = 'true';
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
    for (const y of [year, year + 1]) {
      const inserted = await db.insert(businessCalendarYears).values({
        year: y, holidays: [], source: 'race-test', version: `race-test:${randomUUID()}`, fetchedAt: new Date(),
      }).onConflictDoNothing().returning({ year: businessCalendarYears.year });
      if (inserted.length) createdCalendarYears.push(y);
    }
  });

  afterEach(async () => {
    if (!fixture) return;
    if (fixture.rfpId) await db.delete(rfps).where(eq(rfps.id, fixture.rfpId));
    for (const id of fixture.groupIds) await db.delete(pgRecommendationGroups).where(eq(pgRecommendationGroups.id, id));
    for (const id of fixture.workspaceIds) await db.delete(workspaces).where(eq(workspaces.id, id));
    for (const id of fixture.userIds) await db.delete(users).where(eq(users.id, id));
    fixture = undefined;
  });

  afterAll(async () => {
    if (db) for (const year of createdCalendarYears) await db.delete(businessCalendarYears).where(eq(businessCalendarYears.year, year));
    __resetForTest();
    if (client) await client.end();
    if (priorFlag === undefined) delete process.env.BUSINESS_DEADLINES_ENABLED;
    else process.env.BUSINESS_DEADLINES_ENABLED = priorFlag;
  });

  async function seedFixture(): Promise<Fixture> {
    // The seed helpers only use Drizzle's shared insert API; their PGlite type is a test-harness constraint.
    const seeds = db as unknown as PgliteDB;
    const s: Fixture = {
      rfpId: '', buyer: { userId: '', workspaceId: '' }, pg: { userId: '', workspaceId: '' },
      invitationId: '', userIds: [], workspaceIds: [], groupIds: [],
    };
    fixture = s;
    const buyer = await seedUser(seeds, { email: `buyer-${randomUUID()}@race.test` });
    s.userIds.push(buyer.id);
    const buyerWs = await seedBuyerWorkspace(seeds);
    s.workspaceIds.push(buyerWs.id);
    await seedMembership(seeds, buyerWs.id, buyer.id, 'admin');
    const pg = await seedUser(seeds, { email: `pg-${randomUUID()}@race.test` });
    s.userIds.push(pg.id);
    const pgWs = await seedPgWorkspace(seeds, 'Race PG 1');
    s.workspaceIds.push(pgWs.id);
    await seedMembership(seeds, pgWs.id, pg.id, 'admin');
    const rfp = await seedRfp(seeds, { buyerWsId: buyerWs.id, createdBy: buyer.id, code: `RACE-${randomUUID()}` });
    s.rfpId = rfp.id;
    await db.update(rfps).set({ status: 'sent', sentAt: new Date() }).where(eq(rfps.id, rfp.id));
    const invitationId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invitationId, rfpId: rfp.id, pgWsId: pgWs.id, tokenHash: randomUUID(),
      sentAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'accepted',
    });
    s.buyer = { userId: buyer.id, workspaceId: buyerWs.id };
    s.pg = { userId: pg.id, workspaceId: pgWs.id };
    s.invitationId = invitationId;
    return s;
  }

  async function addPg(s: Fixture, name: string) {
    const seeds = db as unknown as PgliteDB;
    const user = await seedUser(seeds, { email: `pg-${randomUUID()}@race.test` });
    s.userIds.push(user.id);
    const ws = await seedPgWorkspace(seeds, name);
    s.workspaceIds.push(ws.id);
    await seedMembership(seeds, ws.id, user.id, 'admin');
    return { userId: user.id, workspaceId: ws.id };
  }

  async function futureDeadline(days: number): Promise<Date> {
    const now = new Date();
    const through = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const calendar = await (await getBusinessCalendarRepo()).read(now.toISOString().slice(0, 10), through);
    if (!calendar) throw new Error('Missing calendar fixture');
    return new Date(businessDeadline(now, days, calendar));
  }

  async function seedMatching(s: Fixture) {
    const next = await addPg(s, 'Race PG 2');
    const groupId = randomUUID();
    s.groupIds.push(groupId);
    const reviewId = randomUUID();
    await db.insert(pgRecommendationGroups).values({ id: groupId, name: `Race ${groupId}` });
    await db.insert(pgMatchingPolicies).values({ groupId, policy: {
      risk: 'white', candidates: [s.pg.workspaceId, next.workspaceId].map((pgWorkspaceId) => ({
        pgWorkspaceId, reason: '상담', feeMin: null, feeMax: null, feeNote: '',
      })),
    } });
    await db.insert(rfpMatchingRequests).values({
      rfpId: s.rfpId, groupId, industryName: 'Race', risk: 'white',
      buyerWsId: s.buyer.workspaceId, requestKey: randomUUID(), requestPayloadHash: 'fixture',
    });
    await db.insert(rfpPgReviews).values({
      id: reviewId, rfpId: s.rfpId, pgWorkspaceId: s.pg.workspaceId,
      candidate: { pgWorkspaceId: s.pg.workspaceId, name: 'Race PG 1', reason: '상담', feeMin: null, feeMax: null, feeNote: '' },
    });
    return { reviewId, next };
  }

  it('serializes reopening against ending and moving to the next PG', async () => {
    const s = await seedFixture();
    const { reviewId, next } = await seedMatching(s);
    const oldDeadline = new Date(Date.now() - 60_000);
    await db.update(rfps).set({ deadline: oldDeadline }).where(eq(rfps.id, s.rfpId));
    const reopened = await futureDeadline(5);
    const moved = await futureDeadline(6);
    const [reopen, end] = await Promise.all([
      (await getRfpService()).extendDeadline(s.rfpId, oldDeadline.toISOString(), reopened, s.buyer, reviewId, true),
      (await getPgMatchingService()).endAndNext(s.rfpId, reviewId, next.workspaceId, moved, s.buyer),
    ]);
    expect([reopen.ok, end.ok].filter(Boolean)).toHaveLength(1);
    const [stored] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    const reviews = await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.rfpId, s.rfpId));
    if (reopen.ok) {
      expect(stored.deadline).toEqual(reopened);
      expect(reviews.map((r) => r.status).sort()).toEqual(['requested']);
      expect(end).toMatchObject({ ok: false, error: 'RFP_NOT_EXPIRED' });
    } else {
      expect(stored.deadline).toEqual(moved);
      expect(reviews.map((r) => r.status).sort()).toEqual(['buyer_ended', 'requested']);
      expect(reopen).toMatchObject({ ok: false, error: 'DEADLINE_CHANGED' });
    }
  });

  it('moves to the next PG only once under duplicate concurrent requests', async () => {
    const s = await seedFixture();
    const { reviewId, next } = await seedMatching(s);
    await db.update(rfps).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(rfps.id, s.rfpId));
    const deadline = await futureDeadline(5);
    const matching = await getPgMatchingService();
    const results = await Promise.all([
      matching.endAndNext(s.rfpId, reviewId, next.workspaceId, deadline, s.buyer),
      matching.endAndNext(s.rfpId, reviewId, next.workspaceId, deadline, s.buyer),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, error: 'MATCHING_BUSY' });
    expect((await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.rfpId, s.rfpId))).map((r) => r.status).sort())
      .toEqual(['buyer_ended', 'requested']);
  });

  it('rejects a bid that waits behind an award holding the RFP row lock', async () => {
    const s = await seedFixture();
    const second = await addPg(s, 'Race PG 2');
    const secondInvitationId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: secondInvitationId, rfpId: s.rfpId, pgWsId: second.workspaceId, tokenHash: randomUUID(),
      sentAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'accepted',
    });
    const winnerBidId = randomUUID();
    await db.insert(bids).values({
      id: winnerBidId, rfpId: s.rfpId, pgWsId: s.pg.workspaceId, invitationId: s.invitationId,
      round: 1, settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
      status: 'submitted', submittedBy: s.pg.userId, submittedAt: new Date(),
    });
    const repo = await getRfpRepo();
    const original = repo.findByIdForUpdate.bind(repo);
    let releaseAward!: () => void;
    let signalAwardLocked!: () => void;
    let signalSubmitAtLock!: () => void;
    const awardHeld = new Promise<void>((resolve) => { releaseAward = resolve; });
    const awardLocked = new Promise<void>((resolve) => { signalAwardLocked = resolve; });
    const submitAtLock = new Promise<void>((resolve) => { signalSubmitAtLock = resolve; });
    let calls = 0;
    repo.findByIdForUpdate = async (id, tx) => {
      const call = ++calls;
      if (call === 1) {
        const locked = await original(id, tx);
        signalAwardLocked();
        await awardHeld;
        return locked;
      }
      if (call === 2) signalSubmitAtLock();
      return original(id, tx);
    };
    const rfpService = await getRfpService();
    const bidService = await getBidService();
    let submit: Awaited<ReturnType<typeof bidService.submit>>;
    let award: Awaited<ReturnType<typeof rfpService.award>>;
    let awardPromise: ReturnType<typeof rfpService.award> | undefined;
    let submitPromise: ReturnType<typeof bidService.submit> | undefined;
    try {
      awardPromise = rfpService.award(s.rfpId, winnerBidId, s.buyer);
      await Promise.race([awardLocked, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Award did not lock RFP')), 3_000))]);
      submitPromise = bidService.submit({
        rfpId: s.rfpId, settleCycle: 'D+1', settleLimit: 0, guaranteeInsurance: 0,
        signupFee: 0, paymentFees: {}, customFees: {},
      }, second);
      await Promise.race([submitAtLock, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Submit did not reach RFP lock')), 3_000))]);
      const until = Date.now() + 3_000;
      let waiting = false;
      while (Date.now() < until) {
        // Confirm the second transaction is actually blocked by PostgreSQL, not merely queued in JS.
        const rows = await client<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = 'supporter_b_test' AND wait_event_type = 'Lock'
              AND query ILIKE '%rfps%' AND pid <> pg_backend_pid()
          ) AS waiting
        `;
        if (rows[0]?.waiting) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      releaseAward();
      [submit, award] = await Promise.all([submitPromise, awardPromise]);
    } finally {
      releaseAward();
      await Promise.allSettled([awardPromise, submitPromise].filter((promise) => promise !== undefined));
      repo.findByIdForUpdate = original;
    }
    expect(award).toEqual({ ok: true });
    expect(submit).toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
    const [stored] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    expect(stored.status).toBe('awarded');
    expect(stored.awardedBidId).toBe(winnerBidId);
    const secondBids = await db.select().from(bids).where(eq(bids.pgWsId, second.workspaceId));
    expect(secondBids).toHaveLength(0);
  }, 15_000);
});
