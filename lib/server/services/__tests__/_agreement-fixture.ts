import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { bids, rfps, rfpInvitations, signingContracts, pgAgreementRates } from '@/lib/db/schema';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedRfp,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

export async function agreementFixture() {
  __resetForTest();
  const db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  const buyer = await seedUser(db, { name: '구매담당', phone: '01011112222' });
  const pg = await seedUser(db, { name: 'PG담당', phone: '01033334444' });
  const buyerWs = await seedBuyerWorkspace(db);
  const pgWs = await seedPgWorkspace(db, '결제회사');
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  await seedMembership(db, pgWs.id, pg.id, 'admin');
  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  const invitationId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invitationId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    expiresAt: new Date(),
    status: 'accepted',
  });
  const [bid] = await db
    .insert(bids)
    .values({
      rfpId: rfp.id,
      pgWsId: pgWs.id,
      invitationId,
      settleCycle: 'D+2',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: { bank_transfer: 0.018 },
      status: 'submitted',
      submittedBy: pg.id,
    })
    .returning();
  await db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfp.id));
  const [contract] = await db
    .insert(signingContracts)
    .values({ rfpId: rfp.id, createdBy: buyer.id })
    .returning();
  await db
    .insert(pgAgreementRates)
    .values({ pgWsId: pgWs.id, rates: [{ key: 'bank_transfer', rate: 0.02 }] });
  const party = {
    company: '계약상호',
    bizNo: '1234567890',
    address: '서울시 강남구 테헤란로 123',
    representative: '김대표',
  };
  return {
    db,
    rfp,
    bid,
    contract,
    actor: { userId: pg.id, workspaceId: pgWs.id },
    buyerActor: { userId: buyer.id, workspaceId: buyerWs.id },
    parties: { buyer: party, pg: { ...party, company: '결제회사' } },
  };
}
