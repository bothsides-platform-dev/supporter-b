import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { bids, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { loadPgInboxData } from '../pgInbox';

describe('loadPgInboxData', () => {
  let db: PgliteDB;

  beforeEach(async () => {
    db = await createPgliteDb();
    await __useDrizzleWithDbForTest(db);
  });

  afterEach(() => {
    __resetForTest();
  });

  it('PG의 최신 견적과 pending 재요청 마감을 RFP별 Map으로 조립한다', async () => {
    const buyerUser = await seedUser(db, { email: 'buyer@pg-inbox-loader.com' });
    const buyerWs = await seedBuyerWorkspace(db);
    const pgUser = await seedUser(db, { email: 'pg@pg-inbox-loader.com' });
    const pgWs = await seedPgWorkspace(db, 'pg-inbox-loader.com');
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');
    const rfp = await seedRfp(db, {
      buyerWsId: buyerWs.id,
      createdBy: buyerUser.id,
      code: 'P-2609-0010',
    });
    await db
      .update(rfps)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(rfps.id, rfp.id));

    const invitationId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invitationId,
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      acceptedByUserId: pgUser.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      status: 'accepted',
    });
    await db.insert(bids).values(
      [1, 2].map((round) => ({
        id: randomUUID(),
        rfpId: rfp.id,
        pgWsId: pgWs.id,
        invitationId,
        round,
        settleCycle: 'D+1',
        settleLimit: '0',
        guaranteeInsurance: '0',
        paymentFees: {},
        submittedBy: pgUser.id,
      })),
    );
    const requoteDeadline = new Date('2026-09-30T00:00:00.000Z');
    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      round: 3,
      message: '조건을 다시 검토해 주세요',
      deadline: requoteDeadline,
      status: 'pending',
      createdByUserId: buyerUser.id,
      createdAt: new Date(),
    });

    const data = await loadPgInboxData(pgWs.id);

    expect(data.pairs).toHaveLength(1);
    expect(data.bidByRfp.get(rfp.id)?.round).toBe(2);
    expect(data.pendingRequoteDeadlineByRfp.get(rfp.id)).toBe(requoteDeadline.toISOString());
  });
});
