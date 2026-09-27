import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildAgreementDocument } from '@/lib/contract-doc/agreement';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { bids, pgProfiles, rfps, rfpInvitations, signingContracts, signingAgreementDrafts } from '@/lib/db/schema';
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

describe('합의서 회사 정보 재사용', () => {
  const complete = { company: '저장상호', bizNo: '1234567890', address: '서울', representative: '김대표' };
  async function awardedContract(
    db: Awaited<ReturnType<typeof setup>>['db'],
    buyerWsId: string,
    pgWsId: string,
    createdBy: string,
  ) {
    const rfp = await seedRfp(db, { buyerWsId, createdBy });
    const [inv] = await db.insert(rfpInvitations).values({
      rfpId: rfp.id, pgWsId, tokenHash: crypto.randomUUID(), expiresAt: new Date('2099-01-01'),
    }).returning();
    const [bid] = await db.insert(bids).values({
      rfpId: rfp.id, pgWsId, invitationId: inv.id, settleCycle: 'D+1', submittedBy: createdBy,
    }).returning();
    await db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfp.id));
    const [contract] = await db.insert(signingContracts).values({ rfpId: rfp.id, createdBy }).returning();
    return contract;
  }
  async function draft(
    db: Awaited<ReturnType<typeof setup>>['db'],
    contractId: string,
    parties: { buyer: typeof complete; pg: typeof complete },
    updatedAt: Date,
  ) {
    await db.insert(signingAgreementDrafts).values({ contractId, revision: 1, parties, updatedAt });
  }

  it('하이픈 사업자번호는 정규화해 재사용하고 형식이 틀리거나 공백뿐인 상호·대표자는 건너뛴다', async () => {
    const { db, repo, contract, pg } = await setup();
    const buyerWsId = (await db.select({ id: rfps.buyerWsId }).from(rfps).where(eq(rfps.id, contract.rfpId)))[0].id;
    const older = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, older.id, { buyer: { ...complete, bizNo: '123-45-67890' }, pg: { ...complete, company: '옛 PG' } }, new Date('2020-01-01'));
    const newer = [
      { buyer: { ...complete, bizNo: '12345678901' }, pg: { ...complete, company: '  ' } },
      { buyer: { ...complete, representative: '\t' }, pg: { ...complete, representative: ' ' } },
    ];
    for (const [i, parties] of newer.entries()) {
      const c = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
      await draft(db, c.id, parties, new Date(`2021-01-0${i + 1}`));
    }
    expect(await repo.findReusableParties(pg.id, buyerWsId)).toEqual({
      buyer: complete,
      pg: { ...complete, company: '옛 PG' },
    });
  });

  it('최신 초안이 SQL 조건은 통과해도 스키마를 통과하지 못하면 그 이전의 완성 초안을 쓴다', async () => {
    const { db, repo, contract, pg } = await setup();
    const buyerWsId = (await db.select({ id: rfps.buyerWsId }).from(rfps).where(eq(rfps.id, contract.rfpId)))[0].id;
    const older = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, older.id, { buyer: complete, pg: { ...complete, company: '옛 PG' } }, new Date('2020-01-01'));
    // 상호 100자 초과는 SQL 공백 검사는 통과하지만 AgreementPartiesSchema 가 거부한다.
    const tooLong = 'x'.repeat(101);
    const newer = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, newer.id, { buyer: { ...complete, company: tooLong }, pg: { ...complete, company: tooLong } }, new Date('2021-01-01'));
    expect(await repo.findReusableParties(pg.id, buyerWsId)).toEqual({
      buyer: complete,
      pg: { ...complete, company: '옛 PG' },
    });
  });

  it('스키마를 통과하지 못한 최신 초안이 후보 수만큼 쌓이면 더 오래된 초안까지 찾지 않는다', async () => {
    const { db, repo, contract, pg } = await setup();
    const buyerWsId = (await db.select({ id: rfps.buyerWsId }).from(rfps).where(eq(rfps.id, contract.rfpId)))[0].id;
    const older = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, older.id, { buyer: complete, pg: complete }, new Date('2020-01-01'));
    const tooLong = { ...complete, company: 'x'.repeat(101) };
    for (let i = 1; i <= 5; i++) {
      const c = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
      await draft(db, c.id, { buyer: tooLong, pg: tooLong }, new Date(`2021-01-0${i}`));
    }
    expect(await repo.findReusableParties(pg.id, buyerWsId)).toEqual({ buyer: undefined, pg: undefined });
  });

  it('선정이 취소된 견적의 초안은 재사용하지 않는다', async () => {
    const { db, repo, contract, pg } = await setup();
    const buyerWsId = (await db.select({ id: rfps.buyerWsId }).from(rfps).where(eq(rfps.id, contract.rfpId)))[0].id;
    const c = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, c.id, { buyer: complete, pg: complete }, new Date('2022-01-01'));
    await db.update(rfps).set({ status: 'cancelled', awardedBidId: null }).where(eq(rfps.id, c.rfpId));
    expect(await repo.findReusableParties(pg.id, buyerWsId)).toEqual({ buyer: undefined, pg: undefined });
  });

  it('완성된 초안이 여럿이면 가장 최근에 저장한 회사 정보를 쓰고 선정되지 않은 PG의 초안은 쓰지 않는다', async () => {
    const { db, repo, contract, pg } = await setup();
    const buyerWsId = (await db.select({ id: rfps.buyerWsId }).from(rfps).where(eq(rfps.id, contract.rfpId)))[0].id;
    const a = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    const b = await awardedContract(db, buyerWsId, pg.id, contract.createdBy);
    await draft(db, a.id, { buyer: { ...complete, company: '최근' }, pg: { ...complete, company: '최근 PG' } }, new Date('2022-01-01'));
    await draft(db, b.id, { buyer: { ...complete, company: '예전' }, pg: { ...complete, company: '예전 PG' } }, new Date('2021-01-01'));
    const other = await seedPgWorkspace(db, '다른 PG');
    const foreign = await awardedContract(db, buyerWsId, other.id, contract.createdBy);
    await draft(db, foreign.id, { buyer: { ...complete, company: '남의 것' }, pg: { ...complete, company: '남의 PG' } }, new Date('2023-01-01'));
    expect(await repo.findReusableParties(pg.id, buyerWsId)).toEqual({
      buyer: { ...complete, company: '최근' },
      pg: { ...complete, company: '최근 PG' },
    });
  });

  it('PG 가입 사업자번호가 없거나 비어 있으면 undefined를 돌려준다', async () => {
    const { db, repo, pg } = await setup();
    expect(await repo.findPgBizNo(pg.id)).toBeUndefined();
    await db.insert(pgProfiles).values({ workspaceId: pg.id, bizNo: null });
    expect(await repo.findPgBizNo(pg.id)).toBeUndefined();
    await db.update(pgProfiles).set({ bizNo: '9876543210' }).where(eq(pgProfiles.workspaceId, pg.id));
    expect(await repo.findPgBizNo(pg.id)).toBe('9876543210');
  });
});
