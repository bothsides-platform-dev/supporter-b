import { describe, it, expect } from 'vitest';
import { pgAgreementRates, signingContracts } from '@/lib/db/schema';
import { getAgreementService } from '../agreement';
import { getAgreementRepo, getSigningContractRepo } from '@/lib/server/repositories/factory';
import { agreementFixture } from './_agreement-fixture';

describe('AgreementService', () => {
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
