import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const sessionRef: { value: { user: { id: string; email: string; workspaceId: string; workspaceType: 'buyer' | 'pg' } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireBuyerSession: () =>
    sessionRef.value && sessionRef.value.user.workspaceType === 'buyer'
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('FORBIDDEN')),
}));

import { setupRfpActionEnv, teardownRfpActionEnv } from './_setup';
import {
  seedUser, seedBuyerWorkspace, seedMembership, seedPgWorkspace,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, rfpInvitations, rfpRequoteRequests, rfps, outboxEntries } from '@/lib/db/schema';
import { requestRequoteAction } from '../requestRequoteAction';
import { changeRfpDeadlineAction } from '../changeRfpDeadlineAction';
import { getRfpService } from '@/lib/server/services/rfp';
import { getBusinessCalendarRepo } from '@/lib/server/repositories/factory';
import { businessDeadline } from '@/lib/rfp/business-deadline';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;

async function seedBidder() {
  const buyer = await seedUser(db, { email: 'buyer@x.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'pg.io');
  const pgAdmin = await seedUser(db, { email: 'a@pg.io' });
  await seedMembership(db, pgWs.id, pgAdmin.id, 'admin');
  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId, code: 'P-2606-0011', buyerWsId: buyerWs.id, title: 't',
    deadline: new Date(Date.now() + 86_400_000), status: 'sent', createdBy: buyer.id, sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId, rfpId, pgWsId: pgWs.id, tokenHash: randomUUID(),
    sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000 * 7), status: 'accepted',
  });
  await db.insert(bids).values({
    id: randomUUID(), rfpId, pgWsId: pgWs.id, invitationId: invId, round: 1,
    settleCycle: 'D+1', settleLimit: '0', guaranteeInsurance: '0', paymentFees: {},
    status: 'submitted', submittedBy: pgAdmin.id, submittedAt: new Date(),
  });
  return { buyer, buyerWs, pgWs, rfpId };
}

beforeEach(async () => { db = await setupRfpActionEnv(); });
afterEach(() => { teardownRfpActionEnv(); sessionRef.value = null; vi.unstubAllEnvs(); });

describe('requestRequoteAction', () => {
  it('reopens an expired sent request while preserving its existing bid and token expiry', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    const oldDeadline = new Date(Date.now() - 1000);
    await db.update(rfps).set({ deadline: oldDeadline });
    const tokenExpiry = (await db.select().from(rfpInvitations))[0].expiresAt;
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
    await (await getBusinessCalendarRepo()).replaceYear(year, [{ date: `${year}-01-01`, name: '새해' }], now, 'v1');
    await (await getBusinessCalendarRepo()).replaceYear(year + 1, [{ date: `${year + 1}-01-01`, name: '새해' }], now, 'v1');
    const newDeadline = businessDeadline(now, 5, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() });
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    expect(await changeRfpDeadlineAction({ rfpId: s.rfpId, expectedDeadline: oldDeadline.toISOString(), newDeadline, reopen: true }))
      .toEqual({ ok: true });
    expect((await db.select().from(bids))[0].status).toBe('submitted');
    expect((await db.select().from(rfpInvitations))[0].expiresAt).toEqual(tokenExpiry);
    await db.update(rfps).set({ status: 'closed' });
    expect(await changeRfpDeadlineAction({ rfpId: s.rfpId, expectedDeadline: newDeadline, newDeadline: businessDeadline(now, 10, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }), reopen: false }))
      .toEqual({ ok: false, error: 'RFP_NOT_OPEN' });
  });
  it('rejects a stale deadline submitted through the buyer action', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    expect(await changeRfpDeadlineAction({
      rfpId: s.rfpId, expectedDeadline: '2026-01-01T09:00:00.000Z',
      newDeadline: '2027-01-01T09:00:00.000Z', reopen: false,
    })).toEqual({ ok: false, error: 'DEADLINE_CHANGED' });
    vi.unstubAllEnvs();
  });
  it('extends common and pending deadlines atomically without changing invitation expiry', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    expect((await requestRequoteAction({ rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: '개선 요청',
      newDeadline: new Date(Date.now() + 2 * 86_400_000).toISOString() })).ok).toBe(true);
    const before = (await db.select().from(rfps))[0];
    const invitationExpiry = (await db.select().from(rfpInvitations))[0].expiresAt;
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
    const calendarRepo = await getBusinessCalendarRepo();
    await calendarRepo.replaceYear(year, [{ date: `${year}-01-01`, name: '새해' }], now, 'v1');
    await calendarRepo.replaceYear(year + 1, [{ date: `${year + 1}-01-01`, name: '새해' }], now, 'v1');
    const newDeadline = new Date(businessDeadline(now, 10, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
    const otherPg = await seedPgWorkspace(db, 'other-pg.io');
    const respondedDeadline = new Date(Date.now() + 86_400_000);
    const farPending = new Date(businessDeadline(now, 5, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
    await db.insert(rfpRequoteRequests).values([
      { rfpId: s.rfpId, pgWsId: otherPg.id, round: 2, message: '응답 완료', deadline: respondedDeadline, status: 'responded', createdByUserId: s.buyer.id, respondedAt: now },
      { rfpId: s.rfpId, pgWsId: otherPg.id, round: 3, message: '재요청', deadline: farPending, status: 'pending', createdByUserId: s.buyer.id },
    ]);
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    const service = await getRfpService();
    expect(await service.extendDeadline(s.rfpId, before.deadline.toISOString(), new Date(businessDeadline(now, 3, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() })), { userId: s.buyer.id, workspaceId: s.buyerWs.id }))
      .toEqual({ ok: false, error: 'DEADLINE_MUST_EXTEND' });
    const result = await service.extendDeadline(s.rfpId, before.deadline.toISOString(), newDeadline, { userId: s.buyer.id, workspaceId: s.buyerWs.id });
    expect(result).toEqual({ ok: true });
    expect((await db.select().from(rfps))[0].deadline).toEqual(newDeadline);
    const requests = await db.select().from(rfpRequoteRequests);
    expect(requests.filter((r) => r.status === 'pending').map((r) => r.deadline)).toEqual([newDeadline, newDeadline]);
    expect(requests.find((r) => r.status === 'responded')?.deadline).toEqual(respondedDeadline);
    expect((await db.select().from(rfpInvitations))[0].expiresAt).toEqual(invitationExpiry);
    vi.unstubAllEnvs();
  });
  it('does not notify a PG whose invitation was declined when extending the deadline', async () => {
    const s = await seedBidder();
    await db.update(rfpInvitations).set({ status: 'expired' }).where(eq(rfpInvitations.rfpId, s.rfpId));
    const before = (await db.select().from(rfps))[0];
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
    await (await getBusinessCalendarRepo()).replaceYear(year, [], now, 'v1');
    await (await getBusinessCalendarRepo()).replaceYear(year + 1, [], now, 'v1');
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    const deadline = new Date(businessDeadline(now, 5, { coveredThrough: `${year + 1}-12-31`, holidays: new Set() }));
    const result = await (await getRfpService()).extendDeadline(s.rfpId, before.deadline.toISOString(), deadline,
      { userId: s.buyer.id, workspaceId: s.buyerWs.id });
    expect(result).toEqual({ ok: true });
    expect((await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.deadline_changed')))).toHaveLength(0);
  });
  it('calendar activation blocks direct requote actions without confirmed dates', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
    const r = await requestRequoteAction({
      rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: '조건 변경',
      newDeadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(r).toEqual({ ok: false, error: 'CALENDAR_UNAVAILABLE' });
    expect(await db.select().from(rfpRequoteRequests)).toHaveLength(0);
    vi.unstubAllEnvs();
  });
  it('creates a requote when called by the owning buyer', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    const r = await requestRequoteAction({
      rfpId: s.rfpId,
      pgWsIds: [s.pgWs.id],
      message: '카드 수수료를 낮춰주세요',
      newDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    expect(r.ok).toBe(true);
    const reqs = await db.select().from(rfpRequoteRequests).where(eq(rfpRequoteRequests.rfpId, s.rfpId));
    expect(reqs).toHaveLength(1);
  });

  it('rejects empty message via zod', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    const r = await requestRequoteAction({ rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: '   ', newDeadline: new Date(Date.now() + 86_400_000).toISOString() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects an unauthenticated/non-buyer caller', async () => {
    const s = await seedBidder();
    sessionRef.value = null;
    const r = await requestRequoteAction({ rfpId: s.rfpId, pgWsIds: [s.pgWs.id], message: 'x', newDeadline: new Date(Date.now() + 86_400_000).toISOString() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('FORBIDDEN_BUYER');
  });

  it('KST +09:00 오프셋 마감일을 수락한다 (endOfDayKstIso 규약)', async () => {
    const s = await seedBidder();
    sessionRef.value = { user: { id: s.buyer.id, email: 'buyer@x.com', workspaceId: s.buyerWs.id, workspaceType: 'buyer' } };
    // 이 테스트가 검증하는 것은 **오프셋 표기의 수용**(zod datetime({offset:true}))이지
    // 특정 날짜가 아니다. 날짜를 하드코딩하면 그 날이 지나는 순간 서비스의 과거-마감
    // 가드(rfp.ts `newDeadline <= Date.now()`)에 걸려 무관한 이유로 빨개진다 — 실제로
    // 2026-08-01 에 그렇게 터졌다. 오프셋 모양은 유지한 채 날짜만 미래로 파생한다.
    // endOfDayKstIso(<날짜>) === '<날짜>T23:59:59+09:00'
    const kstDay = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const kstDeadline = `${kstDay}T23:59:59+09:00`;
    const r = await requestRequoteAction({
      rfpId: s.rfpId,
      pgWsIds: [s.pgWs.id],
      message: 'KST 마감일 테스트',
      newDeadline: kstDeadline,
    });
    // zod datetime({ offset: true }) 가 +09:00 형식을 수락해야 한다
    expect(r.ok).toBe(true);
  });
});
