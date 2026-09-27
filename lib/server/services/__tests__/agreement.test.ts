import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { seedRfp, seedBuyerWorkspace, seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { bids, bizProfiles, rfps, rfpInvitations, pgAgreementRates, pgProfiles, signingContracts, signingAgreementDrafts, users } from '@/lib/db/schema';
import { getAgreementService } from '../agreement';
import { getAgreementRepo, getSigningContractRepo } from '@/lib/server/repositories/factory';
import { agreementFixture } from './_agreement-fixture';

async function nextAgreement(
  f: Awaited<ReturnType<typeof agreementFixture>>,
  buyerWsId = f.buyerActor.workspaceId,
  pgWsId = f.actor.workspaceId,
) {
  const rfp = await seedRfp(f.db, { buyerWsId, createdBy: f.buyerActor.userId });
  const [invitation] = await f.db.insert(rfpInvitations).values({
    rfpId: rfp.id, pgWsId, tokenHash: randomUUID(), expiresAt: new Date('2099-01-01'),
  }).returning();
  const [bid] = await f.db.insert(bids).values({
    rfpId: rfp.id, pgWsId, invitationId: invitation.id,
    settleCycle: 'D+2', paymentFees: { bank_transfer: 0.018 }, submittedBy: f.actor.userId,
  }).returning();
  await f.db.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfp.id));
  const [contract] = await f.db.insert(signingContracts).values({ rfpId: rfp.id, createdBy: f.buyerActor.userId }).returning();
  return contract;
}

describe('AgreementService', () => {
  it('같은 양측의 다음 계약에 저장한 회사 정보를 채우고 해당 계약에서 다시 수정할 수 있다', async () => {
    const f = await agreementFixture();
    const service = await getAgreementService();
    await service.save(f.contract.id, f.actor, 0, f.parties);
    const next = await nextAgreement(f);
    expect(await service.load(next.id, f.actor)).toMatchObject({ revision: 0, parties: f.parties });
    const changed = { ...f.parties, pg: { ...f.parties.pg, address: '변경한 주소' } };
    expect(await service.save(next.id, f.actor, 0, changed)).toMatchObject({ ok: true });
    expect(await service.load(next.id, f.actor)).toMatchObject({ parties: changed });
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({ parties: f.parties });
  });
  it('구매사 정보는 같은 PG·구매사 사이에서만 재사용하고 PG 정보는 다른 구매사 계약에도 채운다', async () => {
    const f = await agreementFixture();
    const service = await getAgreementService();
    await service.save(f.contract.id, f.actor, 0, f.parties);
    const otherBuyer = await seedBuyerWorkspace(f.db);
    const next = await nextAgreement(f, otherBuyer.id);
    expect(await service.load(next.id, f.actor)).toMatchObject({
      parties: { pg: f.parties.pg, buyer: { company: '구매사', address: '', representative: '' } },
    });
    const otherPg = await seedPgWorkspace(f.db, '다른 결제회사');
    const otherContract = await nextAgreement(f, f.buyerActor.workspaceId, otherPg.id);
    expect(await service.load(otherContract.id, { ...f.actor, workspaceId: otherPg.id })).toMatchObject({
      parties: { pg: { company: '다른 결제회사', address: '', representative: '' }, buyer: { address: '', representative: '' } },
    });
    expect(await service.load(next.id, f.buyerActor)).toMatchObject({ ok: false, error: 'FORBIDDEN' });
  });
  it.each(['   ', '\n\t'])('미완성 주소 %j는 재사용하지 않고 기존 계약의 빈칸은 자동으로 덮어쓰지 않는다', async (address) => {
    const f = await agreementFixture();
    const service = await getAgreementService();
    await service.save(f.contract.id, f.actor, 0, f.parties);
    await f.db.update(signingAgreementDrafts).set({ updatedAt: new Date('2020-01-01') });
    const second = await nextAgreement(f);
    const partial = { ...f.parties, pg: { ...f.parties.pg, address, company: '미완성' } };
    await service.save(second.id, f.actor, 0, partial);
    const third = await nextAgreement(f);
    expect(await service.load(third.id, f.actor)).toMatchObject({ parties: f.parties });
    expect(await service.load(second.id, f.actor)).toMatchObject({ parties: partial });
  });
  it('처음 작성할 때 가입한 PG 사업자번호를 채우고 수정한 초안을 우선한다', async () => {
    const f = await agreementFixture();
    await f.db.insert(pgProfiles).values({ workspaceId: f.actor.workspaceId, bizNo: '9876543210' });
    const service = await getAgreementService();
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({
      parties: { pg: { company: '결제회사', bizNo: '9876543210', address: '', representative: '' } },
    });
    const changed = { ...f.parties, pg: { ...f.parties.pg, bizNo: '1112233333' } };
    expect(await service.save(f.contract.id, f.actor, 0, changed)).toMatchObject({ ok: true });
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({ parties: changed });
  });
  it('저장한 PG 회사 정보가 있으면 가입 사업자번호보다 우선한다', async () => {
    const f = await agreementFixture();
    await f.db.insert(pgProfiles).values({ workspaceId: f.actor.workspaceId, bizNo: '9876543210' });
    const service = await getAgreementService();
    await service.save(f.contract.id, f.actor, 0, f.parties);
    const next = await nextAgreement(f);
    expect(await service.load(next.id, f.actor)).toMatchObject({ parties: { pg: f.parties.pg } });
  });
  it('PG에게 견적의 구매사 사업자번호와 가입 사업자번호를 비교 기준으로 주고 초안이 있어도 유지한다', async () => {
    const f = await agreementFixture();
    await f.db.insert(pgProfiles).values({ workspaceId: f.actor.workspaceId, bizNo: '987-65-43210' });
    const [profile] = await f.db.insert(bizProfiles).values({ bizNo: '111-22-33333', gradeSource: 'unset' }).returning();
    await f.db.update(rfps).set({ bizProfileId: profile.id }).where(eq(rfps.id, f.contract.rfpId));
    const service = await getAgreementService();
    const reference = { buyer: '1112233333', pg: '9876543210' };
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({ referenceBizNo: reference });
    await service.save(f.contract.id, f.actor, 0, f.parties);
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({ referenceBizNo: reference });
    expect(await service.load(f.contract.id, f.buyerActor)).not.toHaveProperty('referenceBizNo');
  });
  it('등록된 사업자번호가 없으면 비교 기준을 비워 둔다', async () => {
    const f = await agreementFixture();
    await f.db.update(rfps).set({ bizProfileId: null }).where(eq(rfps.id, f.contract.rfpId));
    const service = await getAgreementService();
    const view = await service.load(f.contract.id, f.actor);
    expect(view).toMatchObject({ ok: true });
    expect((view as { referenceBizNo?: unknown }).referenceBizNo).toEqual({ buyer: undefined, pg: undefined });
  });
  it('PG의 발송 준비 상태는 현재 양측 연락처에서 파생하고 구매사에게는 노출하지 않는다', async () => {
    const f = await agreementFixture();
    const service = await getAgreementService();
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({
      sendReadiness: { buyer: true, pg: true },
    });
    await f.db.update(users).set({ phone: null }).where(eq(users.id, f.buyerActor.userId));
    await f.db.update(users).set({ phone: '01112345678' }).where(eq(users.id, f.actor.userId));
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({
      sendReadiness: { buyer: false, pg: false },
    });
    expect(await service.load(f.contract.id, f.buyerActor)).not.toHaveProperty('sendReadiness');
    await f.db.update(users).set({ phone: '010-1234-5678' });
    expect(await service.load(f.contract.id, f.actor)).toMatchObject({
      sendReadiness: { buyer: true, pg: true },
    });
  });
  it('만료된 발송 리스로는 문서를 준비하지 않는다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const view = await s.load(f.contract.id, f.actor);
    if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('missing view');
    const stale = new Date(Date.now() - 600_000);
    await (
      await getSigningContractRepo()
    ).claimForSend(f.contract.id, stale, new Date(0), f.actor.userId);
    expect(await s.prepare(f.contract.id, f.actor, view.stamp, stale)).toMatchObject({
      ok: false,
      error: 'AGREEMENT_BUSY',
    });
  });
  it('액션별 세션 부가 필드가 달라도 같은 행위자의 미리보기는 유효하다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const reader = { ...f.actor, workspaceType: 'pg', ok: true };
    const sender = { ...f.actor, email: 'pg@example.com', ok: true };
    const a = await s.load(f.contract.id, reader);
    const b = await s.load(f.contract.id, sender);
    expect(a).toHaveProperty('stamp');
    expect(b).toHaveProperty('stamp', 'stamp' in a ? a.stamp : undefined);
  });
  it('구매사와 다른 PG는 발송 전 초안의 회사 정보를 읽거나 저장할 수 없다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    expect(await s.save(f.contract.id, f.actor, 0, f.parties)).toMatchObject({
      ok: true,
      revision: 1,
    });
    const buyer = await s.load(f.contract.id, f.buyerActor);
    expect(buyer).toMatchObject({
      ok: true,
      mode: 'agreement',
      editable: false,
    });
    expect(buyer).not.toHaveProperty('parties');
    expect(await s.save(f.contract.id, f.buyerActor, 1, f.parties)).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(
      await s.load(f.contract.id, {
        ...f.actor,
        workspaceId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toMatchObject({ ok: false, error: 'FORBIDDEN' });
  });
  it('관리자 요율이 변경되면 기존 미리보기로 발송 준비를 할 수 없다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const view = await s.load(f.contract.id, f.actor);
    if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('missing view');
    const now = new Date();
    await (
      await getSigningContractRepo()
    ).claimForSend(f.contract.id, now, new Date(0), f.actor.userId);
    await f.db.update(pgAgreementRates).set({ version: 2 });
    expect(await s.prepare(f.contract.id, f.actor, view.stamp, now)).toMatchObject({
      ok: false,
      error: 'AGREEMENT_CHANGED',
    });
  });
  it('자동으로 채운 정보가 완성돼 있어도 저장하기 전에는 발송 준비를 거부한다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const next = await nextAgreement(f);
    const view = await s.load(next.id, f.actor);
    if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('missing view');
    expect(view).toMatchObject({ revision: 0, parties: f.parties });
    const now = new Date();
    await (await getSigningContractRepo()).claimForSend(next.id, now, new Date(0), f.actor.userId);
    expect(await s.prepare(next.id, f.actor, view.stamp, now)).toEqual({ ok: false, error: 'AGREEMENT_INCOMPLETE' });
  });
  it('발송 준비는 선정 요율과 완성 문서를 보존하며 입력값 주입을 거부한다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    expect(await s.save(f.contract.id, f.actor, 0, { ...f.parties, fees: [] })).toMatchObject({
      ok: false,
    });
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const view = await s.load(f.contract.id, f.actor);
    if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('missing view');
    const now = new Date();
    await (
      await getSigningContractRepo()
    ).claimForSend(f.contract.id, now, new Date(0), f.actor.userId);
    const result = await s.prepare(f.contract.id, f.actor, view.stamp, now);
    expect(result).toMatchObject({
      ok: true,
      snapshot: {
        feeRows: [{ value: '1.80%', standard: '2.00%', discount: '0.20%p' }],
      },
    });
    const saved = await (await getAgreementRepo()).findDraft(f.contract.id);
    expect(saved?.prepared?.parties.buyer).toEqual(f.parties.buyer);
  });
  it('구매사는 발송된 스냅샷만 읽고 공급자 식별자는 받지 않는다', async () => {
    const f = await agreementFixture();
    const s = await getAgreementService();
    await s.save(f.contract.id, f.actor, 0, f.parties);
    const view = await s.load(f.contract.id, f.actor);
    if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('missing view');
    const now = new Date();
    await (
      await getSigningContractRepo()
    ).claimForSend(f.contract.id, now, new Date(0), f.actor.userId);
    const p = await s.prepare(f.contract.id, f.actor, view.stamp, now);
    if (!p.ok) throw new Error(p.error);
    await f.db.update(signingContracts).set({
      status: 'sent',
      providerRef: 'secret-ref',
      sentDocument: p.snapshot,
    });
    await f.db
      .update(pgAgreementRates)
      .set({ version: 2, rates: [{ key: 'bank_transfer', rate: 0.03 }] });
    const buyer = await s.load(f.contract.id, f.buyerActor);
    expect(buyer).toMatchObject({
      ok: true,
      snapshot: { feeRows: [{ standard: '2.00%' }] },
    });
    expect(JSON.stringify(buyer)).not.toContain('secret-ref');
  });
});
