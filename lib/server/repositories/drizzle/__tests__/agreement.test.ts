import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildAgreementDocument } from '@/lib/contract-doc/agreement';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { bids, rfps, rfpInvitations, signingContracts, signingAgreementDrafts } from '@/lib/db/schema';
import { DrizzleAgreementRepository } from '../agreement';
import { seedBuyerWorkspace, seedPgWorkspace, seedRfp, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  const user = await seedUser(db);
  const buyer = await seedBuyerWorkspace(db);
  const pg = await seedPgWorkspace(db, '결제회사');
  const rfp = await seedRfp(db, { buyerWsId: buyer.id, createdBy: user.id });
  const [contract] = await db
    .insert(signingContracts)
    .values({ rfpId: rfp.id, createdBy: user.id })
    .returning();
  const party = { company: '회사', bizNo: '', address: '', representative: '' };
  return {
    db,
    repo: new DrizzleAgreementRepository(db),
    contract,
    pg,
    parties: { buyer: party, pg: party },
  };
}
describe('합의서 초안 저장', () => {
  it('최초 저장 후 낡은 revision의 저장을 거부하고 남의 수정값을 보존한다', async () => {
    const { repo, contract, parties } = await setup();
    expect(await repo.saveDraft(contract.id, 0, parties)).toBe(1);
    expect(
      await repo.saveDraft(contract.id, 0, {
        ...parties,
        buyer: { ...parties.buyer, company: '낡은 화면' },
      }),
    ).toBeUndefined();
    expect((await repo.findDraft(contract.id))?.parties.buyer.company).toBe('회사');
    expect(await repo.saveDraft(contract.id, 1, parties)).toBe(2);
  });
  it('발송 리스가 있으면 초안을 바꾸지 않는다', async () => {
    const { db, repo, contract, parties } = await setup();
    await db.update(signingContracts).set({ claimedForSendAt: new Date() });
    expect(await repo.saveDraft(contract.id, 0, parties)).toBeUndefined();
  });
  it('공급자 계약이 이미 생겼으면 초안을 바꾸지 않는다', async () => {
    const { db, repo, contract, parties } = await setup();
    await db.update(signingContracts).set({ providerRef: 'already-created' });
    expect(await repo.saveDraft(contract.id, 0, parties)).toBeUndefined();
  });
});

it('선정된 PG에게만 최신 회차의 좁은 계약 요약을 반환한다', async () => {
  const { db, repo, contract, pg, parties } = await setup();
  const [inv] = await db.insert(rfpInvitations).values({
    rfpId: contract.rfpId, pgWsId: pg.id, tokenHash: 'summary-token', expiresAt: new Date('2099-01-01'),
  }).returning();
  const [bid] = await db.insert(bids).values({
    rfpId: contract.rfpId, pgWsId: pg.id, invitationId: inv.id,
    settleCycle: 'D+1', submittedBy: contract.createdBy,
  }).returning();
  await db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, contract.rfpId));
  await repo.saveDraft(contract.id, 0, parties);
  const [first] = await repo.findPgContractSummaries(pg.id);
  expect(first).toEqual({
    rfpId: contract.rfpId, rfpCode: expect.any(String), rfpTitle: 'RFP', buyerName: '구매사',
    status: 'awaiting_pg_template', revision: 1, hasProviderRef: false, hasPrepared: false,
  });
  const other = await seedPgWorkspace(db, '다른 PG');
  expect(await repo.findPgContractSummaries(other.id)).toEqual([]);
  expect(await repo.findPgContractSummaries(pg.id, [])).toEqual([]);
  await db.update(signingContracts).set({ status: 'canceled' }).where(eq(signingContracts.id, contract.id));
  const [latest] = await db.insert(signingContracts).values({
    rfpId: contract.rfpId, createdBy: contract.createdBy, round: 2,
    providerRef: 'private-provider-id',
  }).returning();
  await db.insert(signingAgreementDrafts).values({ contractId: latest.id, revision: 2, parties, prepared: { _v: 1, doc: buildAgreementDocument('회사', '회사'), parties, feeRows: [] } });
  expect(await repo.findPgContractSummaries(pg.id)).toEqual([
    { ...first, revision: 2, hasProviderRef: true, hasPrepared: true },
  ]);
  await db.update(signingContracts).set({ status: 'completed' }).where(eq(signingContracts.id, latest.id));
  expect((await repo.findPgContractSummaries(pg.id))[0].status).toBe('completed');
  await db.update(rfps).set({ status: 'cancelled', awardedBidId: null }).where(eq(rfps.id, contract.rfpId));
  expect(await repo.findPgContractSummaries(pg.id)).toEqual([]);
});
