import { describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { signingContracts } from '@/lib/db/schema';
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
