// getBuyerKanbanData — 배치 로더 통합 + N+1 회귀 가드.
//   - 여러 RFP의 bid/invitation을 RFP별로 정확히 묶어 카드를 만든다.
//   - RFP 수와 무관하게 per-RFP findByRfp 를 호출하지 않는다(배치만 사용).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { bids, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getBidRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { getBuyerKanbanData } from '../buyer-kanban-loader';

let ctx: Awaited<ReturnType<typeof setup>>;

async function setup() {
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);

  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const toss = await seedPgWorkspace(db, 'toss.im');
  const inicis = await seedPgWorkspace(db, 'inicis.com');
  const pgUser = await seedUser(db, { email: 'pg@toss.im' });

  async function seedRfp(code: string) {
    const id = randomUUID();
    await db.insert(rfps).values({
      id,
      code,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: code,
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    return id;
  }
  async function seedInvitation(rfpId: string, pgWsId: string) {
    const id = randomUUID();
    await db.insert(rfpInvitations).values({
      id,
      rfpId,
      pgWsId,
      acceptedByUserId: pgUser.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status: 'accepted',
    });
    return id;
  }
  async function seedBid(rfpId: string, pgWsId: string, invitationId: string) {
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId,
      invitationId,
      settleCycle: 'D+1',
      deposit: '0',
      setupFee: '0',
      monthlyMin: '0',
      bankTransferFeePct: '0.015',
      easyPayFeePct: '0.018',
      submittedBy: pgUser.id,
    });
  }

  // RFP A: 초대 2개(toss, inicis) + 제출 입찰 1개(toss).
  const rfpA = await seedRfp('P-2605-0001');
  const invAToss = await seedInvitation(rfpA, toss.id);
  await seedInvitation(rfpA, inicis.id);
  await seedBid(rfpA, toss.id, invAToss);

  // RFP B: 초대 1개(toss) + 입찰 없음.
  const rfpB = await seedRfp('P-2605-0002');
  await seedInvitation(rfpB, toss.id);

  return { buyerWsId: buyerWs.id };
}

beforeEach(async () => {
  __resetForTest();
  ctx = await setup();
});

afterEach(() => {
  __resetForTest();
  vi.restoreAllMocks();
});

describe('getBuyerKanbanData', () => {
  it('여러 RFP의 bid/invitation을 RFP별로 정확히 묶어 카드 생성', async () => {
    const cards = await getBuyerKanbanData(ctx.buyerWsId);

    expect(cards).toHaveLength(2);
    const a = cards.find((c) => c.rfpId === 'P-2605-0001')!;
    const b = cards.find((c) => c.rfpId === 'P-2605-0002')!;

    expect(a.invitedPgCount).toBe(2);
    expect(a.submittedBidCount).toBe(1);
    expect(b.invitedPgCount).toBe(1);
    expect(b.submittedBidCount).toBe(0);
  });

  it('N+1 가드: per-RFP findByRfp 미호출, findByRfpIds 1회만', async () => {
    const bidRepo = await getBidRepo();
    const invRepo = await getInvitationRepo();
    const bidFindByRfp = vi.spyOn(bidRepo, 'findByRfp');
    const bidFindByRfpIds = vi.spyOn(bidRepo, 'findByRfpIds');
    const invFindByRfp = vi.spyOn(invRepo, 'findByRfp');
    const invFindByRfpIds = vi.spyOn(invRepo, 'findByRfpIds');

    await getBuyerKanbanData(ctx.buyerWsId);

    expect(bidFindByRfp).toHaveBeenCalledTimes(0);
    expect(invFindByRfp).toHaveBeenCalledTimes(0);
    expect(bidFindByRfpIds).toHaveBeenCalledTimes(1);
    expect(invFindByRfpIds).toHaveBeenCalledTimes(1);
  });
});
