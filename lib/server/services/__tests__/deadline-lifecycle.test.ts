import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { bids, pgMatchingPolicies, pgRecommendationGroups, rfpInvitations, rfpMatchingRequests, rfpPgReviews, rfps } from '@/lib/db/schema';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedRfp, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { businessDeadline } from '@/lib/rfp/business-deadline';
import { getBidService } from '../bid';
import { getRfpService } from '../rfp';
import { getPgMatchingService } from '../pg-matching';
import { loadPgRfpDetail } from '@/lib/server/rfp-detail-loader';

vi.mock('@/lib/server/outbox/post-commit', () => ({ flushAfterCommit: vi.fn() }));
vi.mock('@/lib/server/notifications/dispatch', async (importOriginal) => ({
  ...await importOriginal<object>(), emitAfterCommit: vi.fn(),
}));

let db: PgliteDB;
beforeEach(async () => { db = await setupServerTestEnv(); });
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await teardownServerTestEnv(); });

async function seedRequest() {
  const buyer = await seedUser(db, { email: 'buyer@deadline-lifecycle.test' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pg = await seedUser(db, { email: 'pg@deadline-lifecycle.test' });
  const pgWs = await seedPgWorkspace(db, 'Deadline PG');
  await seedMembership(db, pgWs.id, pg.id, 'admin');
  const { id: rfpId } = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  await db.update(rfps).set({ status: 'sent', sentAt: new Date() }).where(eq(rfps.id, rfpId));
  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invitationId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000), status: 'accepted',
  });
  return { buyer: { userId: buyer.id, workspaceId: buyerWs.id }, pg: { userId: pg.id, workspaceId: pgWs.id }, rfpId, invitationId };
}

const quote = (rfpId: string) => ({
  rfpId, settleCycle: 'D+1' as const, settleLimit: 0, guaranteeInsurance: 0,
  signupFee: 0, paymentFees: {} as Record<string, number>, customFees: {} as Record<string, number>,
});

async function seedMatching(s: Awaited<ReturnType<typeof seedRequest>>) {
  const groupId = randomUUID();
  const reviewId = randomUUID();
  await db.insert(pgRecommendationGroups).values({ id: groupId, name: '일반 판매' });
  await db.insert(pgMatchingPolicies).values({ groupId, policy: {
    risk: 'white', candidates: [{ pgWorkspaceId: s.pg.workspaceId, reason: '상담', feeMin: null, feeMax: null, feeNote: '' }],
  } });
  await db.insert(rfpMatchingRequests).values({
    rfpId: s.rfpId, groupId, industryName: '일반 판매', risk: 'white',
    buyerWsId: s.buyer.workspaceId, requestKey: randomUUID(), requestPayloadHash: 'fixture',
  });
  await db.insert(rfpPgReviews).values({
    id: reviewId, rfpId: s.rfpId, pgWorkspaceId: s.pg.workspaceId,
    candidate: { pgWorkspaceId: s.pg.workspaceId, name: 'Deadline PG', reason: '상담', feeMin: null, feeMax: null, feeNote: '' },
  });
  return { reviewId };
}

describe('deadline lifecycle across buyer extension and PG submission', () => {
  it('an extension leaves an already-submitted PG unable to submit another bid', async () => {
    const s = await seedRequest();
    await db.insert(bids).values({
      id: randomUUID(), rfpId: s.rfpId, pgWsId: s.pg.workspaceId, invitationId: s.invitationId,
      round: 1, settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
      status: 'submitted', submittedBy: s.pg.userId, submittedAt: new Date(),
    });
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
    const calendar = await getBusinessCalendarRepo();
    await calendar.replaceYear(year, [{ date: `${year}-01-01`, name: '새해' }], now, 'v1');
    await calendar.replaceYear(year + 1, [{ date: `${year + 1}-01-01`, name: '새해' }], now, 'v1');
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    const [rfp] = await db.select().from(rfps).where(eq(rfps.id, s.rfpId));
    const later = new Date(businessDeadline(now, 10, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
    expect(await (await getRfpService()).extendDeadline(s.rfpId, rfp.deadline.toISOString(), later, s.buyer))
      .toEqual({ ok: true });
    expect(await (await getBidService()).submit(quote(s.rfpId), s.pg))
      .toEqual({ ok: false, error: 'BID_ALREADY_SUBMITTED' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(1);
  });

  it('rejects a first PG submission at the exact stored deadline instant', async () => {
    const s = await seedRequest();
    const instant = new Date('2026-09-28T09:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
    await db.update(rfps).set({ deadline: instant }).where(eq(rfps.id, s.rfpId));
    expect(await (await getBidService()).submit(quote(s.rfpId), s.pg))
      .toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(0);
  });

  it('keeps the previous consultation open when a stale review or removed next candidate is selected', async () => {
    const s = await seedRequest();
    const { reviewId } = await seedMatching(s);
    const nextPg = await seedPgWorkspace(db, 'Unlisted PG');
    await db.update(rfps).set({ deadline: new Date(Date.now() - 1_000) }).where(eq(rfps.id, s.rfpId));
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
    const calendar = await getBusinessCalendarRepo();
    await calendar.replaceYear(year, [{ date: `${year}-01-01`, name: '새해' }], now, 'v1');
    await calendar.replaceYear(year + 1, [{ date: `${year + 1}-01-01`, name: '새해' }], now, 'v1');
    const later = new Date(businessDeadline(now, 5, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    const matching = await getPgMatchingService();
    expect(await matching.endAndNext(s.rfpId, randomUUID(), nextPg.id, later, s.buyer))
      .toEqual({ ok: false, error: 'MATCHING_BUSY' });
    expect(await matching.endAndNext(s.rfpId, reviewId, nextPg.id, later, s.buyer))
      .toEqual({ ok: false, error: 'MATCHING_UNAVAILABLE' });
    expect((await db.select().from(rfpPgReviews).where(eq(rfpPgReviews.rfpId, s.rfpId))).map((r) => r.status))
      .toEqual(['requested']);
    expect((await db.select().from(rfps).where(eq(rfps.id, s.rfpId)))[0].deadline.getTime())
      .toBeLessThan(now.getTime());
  });

  it('rejects a new bid from a PG whose consultation was ended by the buyer', async () => {
    const s = await seedRequest();
    const { reviewId } = await seedMatching(s);
    await db.update(rfpPgReviews).set({ status: 'buyer_ended' }).where(eq(rfpPgReviews.id, reviewId));
    const [rfp] = await db.select({ code: rfps.code }).from(rfps).where(eq(rfps.id, s.rfpId));
    expect(await loadPgRfpDetail({ code: rfp.code, workspaceId: s.pg.workspaceId }))
      .toMatchObject({ review: { id: reviewId, status: 'buyer_ended' }, bidWindowOpen: false });
    expect(await (await getBidService()).submit(quote(s.rfpId), s.pg))
      .toEqual({ ok: false, error: 'MATCHING_REVIEW_CLOSED' });
    expect(await db.select().from(bids).where(eq(bids.rfpId, s.rfpId))).toHaveLength(0);
  });
});
