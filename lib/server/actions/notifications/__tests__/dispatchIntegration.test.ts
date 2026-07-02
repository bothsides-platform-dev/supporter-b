// Regression: Step 9 dispatch wrapper integration in existing actions.
//
// 검증 (advisor pin 3 + hard 제약 3, 9):
//   - submitBidAction 성공 시 bus.subscribe handler가 buyer 멤버 수만큼 호출
//   - submitBidAction 실패 시(BID_ALREADY_SUBMITTED) handler 추가 호출 없음
//     (rollback과 emit 정합)
//   - awardRfpAction 성공 시 winner+loser 멤버 수만큼 handler 호출
//
// 이 테스트는 “일부만 wrapper로 가고 나머지 raw 호출 남는” 일관성 깨짐을
// 발견하기 위한 안전망. raw notifRepo.save로 회귀하면 emit 카운트가 0 →
// 실패.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { rfps, rfpInvitations, bids, outboxEntries } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  setupRfpActionEnv,
  teardownRfpActionEnv,
} from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetBusForTest,
  subscribe,
} from '@/lib/server/notifications/bus';
import type { Notification } from '@/lib/types/notification';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      workspaceId: string;
      workspaceType: 'pg' | 'buyer';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value || sessionRef.value.user.workspaceType !== 'pg')
      return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value || sessionRef.value.user.workspaceType !== 'buyer')
      return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { submitBidAction } from '../../bid/submitBidAction';
import { awardRfpAction } from '../../rfp/awardRfpAction';

let db: PgliteDB;

describe('dispatch wrapper integration in actions (advisor pin 3)', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
    __resetBusForTest();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    __resetBusForTest();
    sessionRef.value = null;
  });

  it('submitBidAction emits to each buyer member after commit', async () => {
    // Buyer with 2 members.
    const b1 = await seedUser(db, { email: 'b1@x.com' });
    const b2 = await seedUser(db, { email: 'b2@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, b1.id, 'admin');
    await seedMembership(db, buyerWs.id, b2.id);

    // PG ws + claimer.
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pgUser = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = randomUUID();
    const rfpCode = 'P-2605-9001';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 't',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: b1.id,
      sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId,
      pgWsId: pgWs.id,
      acceptedByUserId: pgUser.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'accepted',
    });

    const recvB1: Notification[] = [];
    const recvB2: Notification[] = [];
    subscribe(b1.id, (n) => recvB1.push(n));
    subscribe(b2.id, (n) => recvB2.push(n));

    sessionRef.value = {
      user: {
        id: pgUser.id,
        email: pgUser.email,
        workspaceId: pgWs.id,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({
      rfpId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: { bank_transfer: 0.001 },
    });
    expect(r.ok).toBe(true);

    // Each buyer member received exactly 1 emit (advisor pin 6 fan-out).
    expect(recvB1).toHaveLength(1);
    expect(recvB2).toHaveLength(1);
    expect(recvB1[0].type).toBe('bid.submitted');
    expect(recvB1[0].channel).toBe('inapp');
  });

  it('failed submitBidAction (BID_ALREADY_SUBMITTED) does NOT emit on second call', async () => {
    const b1 = await seedUser(db, { email: 'b1@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, b1.id, 'admin');

    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pgUser = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = randomUUID();
    const rfpCode = 'P-2605-9002';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 't',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: b1.id,
      sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId,
      pgWsId: pgWs.id,
      acceptedByUserId: pgUser.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      status: 'accepted',
    });

    const recv: Notification[] = [];
    subscribe(b1.id, (n) => recv.push(n));

    sessionRef.value = {
      user: {
        id: pgUser.id,
        email: pgUser.email,
        workspaceId: pgWs.id,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const input = {
      rfpId,
      settleCycle: 'D+1',
      settleLimit: 0,
      guaranteeInsurance: 0,
      paymentFees: { bank_transfer: 0.001 },
    };
    const r1 = await submitBidAction(input);
    expect(r1.ok).toBe(true);
    expect(recv).toHaveLength(1);

    const r2 = await submitBidAction(input);
    expect(r2.ok).toBe(false);
    // 두 번째 호출은 사전 check에서 BID_ALREADY_SUBMITTED — emit 추가 없음.
    expect(recv).toHaveLength(1);
  });

  it('awardRfpAction emits winner + loser notifications after commit', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const winnerWs = await seedPgWorkspace(db, 'toss.im');
    const winnerUser = await seedUser(db, { email: 'w@toss.im' });
    await seedMembership(db, winnerWs.id, winnerUser.id, 'admin');

    const loserWs = await seedPgWorkspace(db, 'inicis.com');
    const loserUser = await seedUser(db, { email: 'l@inicis.com' });
    await seedMembership(db, loserWs.id, loserUser.id);

    const rfpId = randomUUID();
    const rfpCode = 'P-2605-9003';
    await db.insert(rfps).values({
      id: rfpId,
      code: rfpCode,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 't',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });

    async function seedBid(
      pgWsId: string,
      submittedBy: string,
    ): Promise<string> {
      const invId = randomUUID();
      await db.insert(rfpInvitations).values({
        id: invId,
        rfpId,
        pgWsId,
        tokenHash: randomUUID(),
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'accepted',
      });
      const bidId = randomUUID();
      await db.insert(bids).values({
        id: bidId,
        rfpId,
        pgWsId,
        invitationId: invId,
        settleCycle: 'D+1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        paymentFees: {},
        status: 'submitted',
        submittedBy,
        submittedAt: new Date(),
      });
      return bidId;
    }
    const winnerBidId = await seedBid(winnerWs.id, winnerUser.id);
    await seedBid(loserWs.id, loserUser.id);

    const recvWinner: Notification[] = [];
    const recvLoser: Notification[] = [];
    subscribe(winnerUser.id, (n) => recvWinner.push(n));
    subscribe(loserUser.id, (n) => recvLoser.push(n));

    sessionRef.value = {
      user: {
        id: buyer.id,
        email: buyer.email,
        workspaceId: buyerWs.id,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };

    const r = await awardRfpAction({ rfpId, awardedBidId: winnerBidId });
    expect(r.ok).toBe(true);

    expect(recvWinner).toHaveLength(1);
    expect(recvWinner[0].type).toBe('rfp.awarded');
    expect(recvLoser).toHaveLength(1);
    expect(recvLoser[0].type).toBe('rfp.rejected');

    // 통합 후: winner 이메일은 memberRecipientsBatch(notifiableAccount) 경유.
    // 실계정 winnerUser 는 두 필터 모두 통과 → 이메일 1건 enqueue (델타 0 확인).
    const winnerOutbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'rfp.awarded'));
    expect(winnerOutbox).toHaveLength(1);
    expect(winnerOutbox[0].toAddr).toBe('w@toss.im');
    expect(winnerOutbox[0].dedupeKey).toBe(`rfp:${rfpId}:awarded:w@toss.im`);
  });
});
