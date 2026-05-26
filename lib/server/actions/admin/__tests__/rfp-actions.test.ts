import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { rfps, bids, rfpInvitations, adminAuditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { seedUser, seedBuyerWorkspace, seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';

vi.mock('@/lib/auth/admin-session', () => ({
  requireAdminSession: () => Promise.resolve({ adminId: 'admin' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let db: PgliteDB;
let rfpId: string;
let pgWsId: string;
let invitationId: string;
let pgUserId: string;

beforeEach(async () => {
  db = await createPgliteDb();

  const buyer = await seedUser(db, { email: 'buyer@test.com' });

  const buyerWs = await seedBuyerWorkspace(db, { name: '테스트 구매사' });

  const pgWs = await seedPgWorkspace(db, 'toss-payments');
  pgWsId = pgWs.id;

  const pgUser = await seedUser(db, { email: 'pg@test.com' });
  pgUserId = pgUser.id;

  const futureDeadline = new Date(Date.now() + 7 * 86_400_000);
  const [rfp] = await db.insert(rfps).values({
    id: randomUUID(),
    code: `P-2605-${Math.floor(1000 + Math.random() * 8999)}`,
    buyerWsId: buyerWs.id,
    title: '테스트 RFP',
    status: 'sent',
    deadline: futureDeadline,
    createdBy: buyer.id,
  }).returning();
  rfpId = rfp.id;

  const [inv] = await db.insert(rfpInvitations).values({
    id: randomUUID(),
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: hashToken(generateToken()),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'pending',
  }).returning();
  invitationId = inv.id;
});

// ---------------------------------------------------------------------------
// extendRfpDeadlineAction
// ---------------------------------------------------------------------------
describe('extendRfpDeadlineAction', () => {
  it('days 범위 이탈 시 INVALID_DAYS 반환 (0)', async () => {
    const { extendRfpDeadlineAction } = await import('../extendRfpDeadlineAction');
    const result = await extendRfpDeadlineAction(db, rfpId, 0);
    expect(result).toEqual({ ok: false, error: 'INVALID_DAYS' });
  });

  it('days 범위 이탈 시 INVALID_DAYS 반환 (31)', async () => {
    const { extendRfpDeadlineAction } = await import('../extendRfpDeadlineAction');
    const result = await extendRfpDeadlineAction(db, rfpId, 31);
    expect(result).toEqual({ ok: false, error: 'INVALID_DAYS' });
  });

  it('rfp.deadline을 days일 연장한다', async () => {
    const { extendRfpDeadlineAction } = await import('../extendRfpDeadlineAction');
    const [before] = await db.select({ deadline: rfps.deadline }).from(rfps).where(eq(rfps.id, rfpId));
    await extendRfpDeadlineAction(db, rfpId, 7);
    const [after] = await db.select({ deadline: rfps.deadline }).from(rfps).where(eq(rfps.id, rfpId));
    const diffMs = new Date(after.deadline).getTime() - new Date(before.deadline).getTime();
    expect(Math.round(diffMs / 86_400_000)).toBe(7);
  });

  it('admin_audit_log에 rfp.extend 이벤트 기록', async () => {
    const { extendRfpDeadlineAction } = await import('../extendRfpDeadlineAction');
    await extendRfpDeadlineAction(db, rfpId, 7);
    const logs = await db.select().from(adminAuditLogs);
    expect(logs[0].action).toBe('rfp.extend');
    expect(logs[0].entityId).toBe(rfpId);
    expect(logs[0].actor).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// hideQuoteAction
// ---------------------------------------------------------------------------
describe('hideQuoteAction', () => {
  it('reason 없으면 REASON_REQUIRED 반환', async () => {
    const { hideQuoteAction } = await import('../hideQuoteAction');
    const result = await hideQuoteAction(db, randomUUID(), '');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('reason 공백만 있어도 REASON_REQUIRED 반환', async () => {
    const { hideQuoteAction } = await import('../hideQuoteAction');
    const result = await hideQuoteAction(db, randomUUID(), '   ');
    expect(result).toEqual({ ok: false, error: 'REASON_REQUIRED' });
  });

  it('bid.status를 withdrawn으로 변경', async () => {
    const [bid] = await db.insert(bids).values({
      rfpId,
      pgWsId,
      invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      submittedBy: pgUserId,
    }).returning();
    const { hideQuoteAction } = await import('../hideQuoteAction');
    await hideQuoteAction(db, bid.id, '부적절한 견적');
    const [updated] = await db.select({ status: bids.status }).from(bids).where(eq(bids.id, bid.id));
    expect(updated.status).toBe('withdrawn');
  });

  it('admin_audit_log에 bid.hide 이벤트 기록', async () => {
    const [bid] = await db.insert(bids).values({
      rfpId,
      pgWsId,
      invitationId,
      settleCycle: 'D+1',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      submittedBy: pgUserId,
    }).returning();
    const { hideQuoteAction } = await import('../hideQuoteAction');
    await hideQuoteAction(db, bid.id, '부적절한 견적');
    const logs = await db.select().from(adminAuditLogs);
    expect(logs.some(l => l.action === 'bid.hide')).toBe(true);
    expect(logs.find(l => l.action === 'bid.hide')?.entityId).toBe(bid.id);
  });
});

// ---------------------------------------------------------------------------
// sendReminderAction
// ---------------------------------------------------------------------------
describe('sendReminderAction', () => {
  it('pgWsIds 빈 배열 시 NO_TARGETS 반환', async () => {
    const { sendReminderAction } = await import('../sendReminderAction');
    const result = await sendReminderAction(db, rfpId, []);
    expect(result).toEqual({ ok: false, error: 'NO_TARGETS' });
  });

  it('sent 카운트를 pgWsIds.length로 반환', async () => {
    const { sendReminderAction } = await import('../sendReminderAction');
    const result = await sendReminderAction(db, rfpId, [pgWsId]);
    expect(result).toEqual({ ok: true, sent: 1 });
  });

  it('admin_audit_log에 reminder.send 이벤트 기록', async () => {
    const { sendReminderAction } = await import('../sendReminderAction');
    await sendReminderAction(db, rfpId, [pgWsId]);
    const logs = await db.select().from(adminAuditLogs);
    const log = logs.find(l => l.action === 'reminder.send');
    expect(log).toBeDefined();
    expect(log?.entityId).toBe(rfpId);
    expect((log?.payloadJson as { after?: { targetCount?: number } })?.after?.targetCount).toBe(1);
  });
});
