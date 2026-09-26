import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { rfps, deadlineNotificationDeliveries, notifications, rfpInvitations, businessCalendarYears, businessCalendarChanges, outboxEntries, rfpRequoteRequests, rfpMatchingRequests, rfpPgReviews } from '@/lib/db/schema';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedBuyerWorkspace, seedMembership, seedPgWorkspace, seedRfp, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { runRfpDeadlineNotices } from '../rfp-deadlines';
import { getRfpRepo } from '@/lib/server/repositories/factory';

let db: Awaited<ReturnType<typeof setupServerTestEnv>>;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T09:00:00Z'));
  db = await setupServerTestEnv();
  vi.stubEnv('BUSINESS_DEADLINES_ENABLED', 'true');
});
afterEach(() => { teardownServerTestEnv(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('RFP deadline cron', () => {
  it('notifies the buyer once when the last pending deadline closes', async () => {
    const buyer = await seedBuyerWorkspace(db);
    const user = await seedUser(db);
    const teammate = await seedUser(db);
    await seedMembership(db, buyer.id, user.id);
    await seedMembership(db, buyer.id, teammate.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-04T12:00:00Z') }).where(eq(rfps.id, rfp.id));
    await runRfpDeadlineNotices();
    await runRfpDeadlineNotices();
    const claims = await db.select().from(deadlineNotificationDeliveries).where(eq(deadlineNotificationDeliveries.rfpId, rfp.id));
    const sent = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    expect(claims).toHaveLength(2);
    expect(sent.filter((item) => item.type === 'rfp.bidding_closed')).toHaveLength(1);
    const mail = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.bidding_closed'));
    expect(mail).toHaveLength(2);
    expect(new Set(mail.map((item) => item.dedupeKey)).size).toBe(2);
  });

  it('does not announce a closing that happened long before the feature was switched on', async () => {
    const buyer = await seedBuyerWorkspace(db);
    const user = await seedUser(db);
    await seedMembership(db, buyer.id, user.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-07-07T14:59:59Z') }).where(eq(rfps.id, rfp.id));
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, user.id));
    const mail = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.bidding_closed'));
    expect(sent.filter((item) => item.type === 'rfp.bidding_closed')).toHaveLength(0);
    expect(mail).toHaveLength(0);
  });

  it('reminds only an unsubmitted PG on the preceding Korean business morning', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    const pgUser = await seedUser(db);
    await seedMembership(db, buyer.id, owner.id);
    await seedMembership(db, pg.id, pgUser.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-02T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpInvitations).values({ rfpId: rfp.id, pgWsId: pg.id, tokenHash: rfp.id, expiresAt: new Date('2026-10-08T00:00:00Z') });
    await db.insert(businessCalendarYears).values({ year: 2026, holidays: [], source: 'test', version: 'v1', fetchedAt: new Date() });
    await runRfpDeadlineNotices();
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, pgUser.id));
    expect(sent.filter((item) => item.type === 'rfp.deadline_reminder')).toHaveLength(1);
    expect(sent.find((item) => item.type === 'rfp.deadline_reminder')?.body).toContain('10월 2일 오후 6시');
  });
  it('excludes explicitly declined invitations but keeps a pending invitation whose entry token aged out', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const declinedPg = await seedPgWorkspace(db, 'Declined PG');
    const pendingPg = await seedPgWorkspace(db, 'Pending PG');
    const declinedUser = await seedUser(db);
    const pendingUser = await seedUser(db);
    await seedMembership(db, declinedPg.id, declinedUser.id);
    await seedMembership(db, pendingPg.id, pendingUser.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-02T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpInvitations).values([
      { rfpId: rfp.id, pgWsId: declinedPg.id, tokenHash: `${rfp.id}:declined`, status: 'expired', expiresAt: new Date('2026-10-08T00:00:00Z') },
      { rfpId: rfp.id, pgWsId: pendingPg.id, tokenHash: `${rfp.id}:pending`, status: 'pending', expiresAt: new Date('2026-09-30T00:00:00Z') },
    ]);
    await db.insert(businessCalendarYears).values({ year: 2026, holidays: [], source: 'test', version: 'v1', fetchedAt: new Date() });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.type, 'rfp.deadline_reminder'));
    expect(sent.map((item) => item.userId)).toEqual([pendingUser.id]);
  });

  it('does not remind after the deadline if a row-lock wait crosses it', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    const pgUser = await seedUser(db);
    await seedMembership(db, pg.id, pgUser.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-02T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpInvitations).values({ rfpId: rfp.id, pgWsId: pg.id, tokenHash: rfp.id, expiresAt: new Date('2026-10-08T00:00:00Z') });
    await db.insert(businessCalendarYears).values({ year: 2026, holidays: [], source: 'test', version: 'v1', fetchedAt: new Date() });
    const repo = await getRfpRepo();
    const original = repo.findByIdForUpdate.bind(repo);
    vi.spyOn(repo, 'findByIdForUpdate').mockImplementation(async (...args) => {
      const row = await original(...args);
      vi.setSystemTime(new Date('2026-10-02T09:00:00Z'));
      return row;
    });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, pgUser.id));
    expect(sent.filter((item) => item.type === 'rfp.deadline_reminder')).toHaveLength(0);
  });

  it('shows the actual KST time for a legacy 23:59 deadline', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    const pgUser = await seedUser(db);
    await seedMembership(db, pg.id, pgUser.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-02T14:59:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpInvitations).values({ rfpId: rfp.id, pgWsId: pg.id, tokenHash: rfp.id, expiresAt: new Date('2026-10-08T00:00:00Z') });
    await db.insert(businessCalendarYears).values({ year: 2026, holidays: [], source: 'test', version: 'v1', fetchedAt: new Date() });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, pgUser.id));
    expect(sent.find((item) => item.type === 'rfp.deadline_reminder')?.body).toContain('10월 2일 오후 11시 59분');
  });

  it('notifies the buyer once for a newly added holiday within an open request', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    await seedMembership(db, buyer.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    const sentAt = new Date('2026-09-28T00:00:00Z');
    await db.update(rfps).set({ status: 'sent', sentAt, deadline: new Date('2026-10-05T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(businessCalendarChanges).values({ id: crypto.randomUUID(), date: '2026-10-02', name: '임시공휴일', source: 'test', version: 'v2', createdAt: new Date('2026-09-30T00:00:00Z') });
    await runRfpDeadlineNotices();
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(sent.filter((item) => item.type === 'rfp.calendar_changed')).toHaveLength(1);
  });

  it('escapes an operator holiday name in the email body', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    await seedMembership(db, buyer.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', sentAt: new Date('2026-09-28T00:00:00Z'), deadline: new Date('2026-10-05T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(businessCalendarChanges).values({ id: crypto.randomUUID(), date: '2026-10-02', name: '<script>alert(1)</script>', source: 'test', version: 'v2', createdAt: new Date('2026-09-30T00:00:00Z') });
    await runRfpDeadlineNotices();
    const mail = await db.select().from(outboxEntries).where(eq(outboxEntries.event, 'rfp.calendar_changed'));
    expect(mail[0].html).not.toContain('<script>');
    expect(mail[0].html).toContain('&lt;script&gt;');
  });

  it('announces a holiday when common deadline passed but a pending requote remains open', async () => {
    vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, buyer.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', sentAt: new Date('2026-09-28T00:00:00Z'), deadline: new Date('2026-10-02T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpRequoteRequests).values({ rfpId: rfp.id, pgWsId: pg.id, round: 2, message: '다시', deadline: new Date('2026-10-07T09:00:00Z'), createdByUserId: owner.id });
    await db.insert(businessCalendarChanges).values({ id: crypto.randomUUID(), date: '2026-10-06', name: '임시휴일', source: 'test', version: 'v2', createdAt: new Date('2026-10-01T00:00:00Z') });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(sent.filter((item) => item.type === 'rfp.calendar_changed')).toHaveLength(1);
    expect(sent.filter((item) => item.type === 'rfp.bidding_closed')).toHaveLength(0);
  });

  it('does not propose reopening a rejected one-to-one consultation', async () => {
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, buyer.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-02T09:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpMatchingRequests).values({ rfpId: rfp.id, industryName: '업종', risk: 'gray', buyerWsId: buyer.id, requestKey: crypto.randomUUID(), requestPayloadHash: 'hash' });
    await db.insert(rfpPgReviews).values({ rfpId: rfp.id, pgWorkspaceId: pg.id, status: 'rejected', candidate: { pgWorkspaceId: pg.id, name: 'PG', reason: '', feeMin: null, feeMax: null, feeNote: '' } });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(sent.filter((item) => item.type === 'rfp.bidding_closed')).toHaveLength(0);
  });

  it('offers a next PG to a buyer when an active one-to-one consultation closes without a quote', async () => {
    const buyer = await seedBuyerWorkspace(db);
    const owner = await seedUser(db);
    const pg = await seedPgWorkspace(db, 'PG');
    await seedMembership(db, buyer.id, owner.id);
    const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: owner.id });
    await db.update(rfps).set({ status: 'sent', deadline: new Date('2026-10-05T08:00:00Z') }).where(eq(rfps.id, rfp.id));
    await db.insert(rfpMatchingRequests).values({ rfpId: rfp.id, industryName: '업종', risk: 'gray', buyerWsId: buyer.id, requestKey: crypto.randomUUID(), requestPayloadHash: 'hash' });
    await db.insert(rfpPgReviews).values({ rfpId: rfp.id, pgWorkspaceId: pg.id, status: 'requested', candidate: { pgWorkspaceId: pg.id, name: 'PG', reason: '', feeMin: null, feeMax: null, feeNote: '' } });
    await runRfpDeadlineNotices();
    const sent = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
    expect(sent.find((item) => item.type === 'rfp.bidding_closed')?.body).toContain('다음 PG사');
  });
});
