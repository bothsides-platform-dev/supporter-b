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
import { bids, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { requestRequoteAction } from '../requestRequoteAction';
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
afterEach(() => { teardownRfpActionEnv(); sessionRef.value = null; });

describe('requestRequoteAction', () => {
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
