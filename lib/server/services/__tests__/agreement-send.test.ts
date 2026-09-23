import * as agreementServices from '../agreement';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgreementService } from '../agreement';
import { getContractSigningService } from '../contract-signing';
import {
  getAgreementRepo,
  getSigningContractRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';
import {
  __setSnowSignClientForTest,
  type SnowSignClient,
} from '@/lib/server/signing/snowsign-client';
import { agreementFixture } from './_agreement-fixture';
import { uploadPdfBytes } from '@/lib/server/signing/upload-bytes';
import { pgAgreementRates, signingContracts } from '@/lib/db/schema';

vi.mock('@/lib/server/signing/upload-bytes', () => ({
  uploadPdfBytes: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/notifications/operator-signing', () => ({
  notifySigningOperator: vi.fn(),
}));
vi.mock('@/lib/contract-doc/render-pdf', () => ({
  renderContractPdf: vi.fn(async () => ({
    bytes: new Uint8Array([1, 2]),
    fields: [],
  })),
}));

const client = {
  createUploadSession: vi.fn(async () => ({
    uploadId: 'upload1',
    uploadUrl: 'https://example.com',
    expiresAt: new Date().toISOString(),
  })),
  createContract: vi.fn(async () => ({ contractId: 'agreement1' })),
  sendContract: vi.fn(async () => ({
    contractId: 'agreement1',
    sentAt: new Date().toISOString(),
  })),
  getContract: vi.fn(),
  cancel: vi.fn(),
} as unknown as SnowSignClient;

beforeEach(() => {
  vi.clearAllMocks();
  __setSnowSignClientForTest(client);
});

async function ready() {
  const f = await agreementFixture();
  const service = await getAgreementService();
  await service.save(f.contract.id, f.actor, 0, f.parties);
  const view = await service.load(f.contract.id, f.actor);
  if (!view.ok || view.mode !== 'agreement' || !view.stamp) throw new Error('no stamp');
  return {
    ...f,
    stamp: view.stamp,
    signing: await getContractSigningService(),
  };
}
describe('공통 합의서 발송', () => {
  it('조립한 계약 서비스는 전역 합의서 서비스를 다시 조회하지 않고 발송한다', async () => {
    const f = await ready();
    const repo = await getSigningContractRepo();
    const spy = vi.spyOn(agreementServices, 'getAgreementService').mockRejectedValue(new Error('전역 합의서 서비스 재조회'));
    try {
      expect(await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).toEqual({ ok: true });
      expect((await repo.findById(f.contract.id))?.contract.status).toBe('sent');
      expect(await repo.findSentDocument(f.contract.id)).toMatchObject({ _v: 1, agreement: expect.any(Object) });
    } finally {
      spy.mockRestore();
    }
  });

  it('발송 준비 중 담당자 정보가 엇갈리면 다른 수신자에게 보내지 않는다', async () => {
    const f = await ready();
    const repo = await getUserRepo();
    const contact = await repo.findContactById(f.buyerActor.userId);
    const spy = vi
      .spyOn(repo, 'findContactById')
      .mockResolvedValueOnce({ ...contact!, email: 'changed@example.com' });
    try {
      expect(await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).toMatchObject({
        ok: false,
        error: 'AGREEMENT_CHANGED',
      });
      expect(client.createContract).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
  it('기존 공급자 초안은 새 합의서 발송으로 취소하지 않는다', async () => {
    const f = await agreementFixture();
    await f.db.update(signingContracts).set({ providerRef: 'legacy-draft' });
    const service = await getContractSigningService();
    expect(await service.sendAgreement(f.contract.id, f.actor, 'arbitrary')).toMatchObject({
      ok: false,
      error: 'AGREEMENT_NOT_APPLICABLE',
    });
    expect(client.getContract).not.toHaveBeenCalled();
    expect(client.cancel).not.toHaveBeenCalled();
  });
  it('PG 템플릿 연결 없이 발송하고 발송 문서를 원자적으로 보존한다', async () => {
    const f = await ready();
    expect(await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).toEqual({ ok: true });
    const stored = await (await getSigningContractRepo()).findById(f.contract.id);
    expect(stored?.contract.status).toBe('sent');
    const snapshot = await (await getSigningContractRepo()).findSentDocument(f.contract.id);
    expect(snapshot?.feeRows[0].value).toBe('1.80%');
    expect(snapshot?.parties.buyer).toEqual(f.parties.buyer);
    expect(uploadPdfBytes).toHaveBeenCalledOnce();
    expect(client.createContract).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('장기계약 부속합의서'),
      }),
    );
  });
  it('미리보기 판본이 다르면 공급자 계약을 만들지 않고 리스를 반납한다', async () => {
    const f = await ready();
    expect(await f.signing.sendAgreement(f.contract.id, f.actor, 'outdated')).toMatchObject({
      ok: false,
      error: 'AGREEMENT_CHANGED',
    });
    expect(client.createContract).not.toHaveBeenCalled();
    expect(await (await getSigningContractRepo()).findSendLease(f.contract.id)).toBeUndefined();
  });
  it('직접 호출해도 새 계약을 기존 PDF·템플릿 경로로 보낼 수 없다', async () => {
    const f = await ready();
    expect(await f.signing.createSendEmbedSession(f.rfp.id, f.actor)).toMatchObject({
      ok: false,
      error: 'AGREEMENT_REQUIRED',
    });
    expect(await f.signing.sendFromTemplate(f.rfp.id, f.actor)).toMatchObject({
      ok: false,
      error: 'AGREEMENT_REQUIRED',
    });
    expect(
      await f.signing.attachProviderContract(f.rfp.id, 'other-contract', f.actor),
    ).toMatchObject({ ok: false, error: 'AGREEMENT_REQUIRED' });
    expect(await f.signing.listRecoveryCandidates(f.rfp.id, f.actor)).toMatchObject({
      ok: false,
      error: 'AGREEMENT_REQUIRED',
    });
  });
  it.each(['pending', 'completed'])(
    '발송 결과 유실 후 %s 계약은 보존한 문서로 복구한다',
    async (status) => {
      const f = await ready();
      vi.mocked(client.sendContract).mockRejectedValueOnce(new Error('response lost'));
      expect((await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).ok).toBe(false);
      expect((await (await getAgreementRepo()).findDraft(f.contract.id))?.prepared).toBeTruthy();
      await f.db
        .update(pgAgreementRates)
        .set({ version: 2, rates: [{ key: 'bank_transfer', rate: 0.03 }] });
      const preserved = await (await getAgreementService()).load(f.contract.id, f.actor);
      expect(preserved).toMatchObject({
        editable: false,
        fees: [{ standard: '2.00%' }],
      });
      vi.mocked(client.getContract).mockResolvedValueOnce({
        contractId: 'agreement1',
        status,
        participants: [
          { name: '구매담당', email: 'buyer@example.com', status: 'pending' },
          { name: 'PG담당', email: 'pg@example.com', status: 'pending' },
        ],
      });
      await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp);
      expect(client.createContract).toHaveBeenCalledOnce();
      expect(
        (await (await getSigningContractRepo()).findSentDocument(f.contract.id))?.feeRows[0].value,
      ).toBe('1.80%');
      if (status === 'completed')
        expect(
          (await (await getSigningContractRepo()).findById(f.contract.id))?.contract.status,
        ).toBe('completed');
    },
  );
});
