import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgreementService } from '../agreement';
import { getContractSigningService } from '../contract-signing';
import { getAgreementRepo, getSigningContractRepo } from '@/lib/server/repositories/factory';
import {
  __setSnowSignClientForTest,
  type SnowSignClient,
  type SnowSignContractDetail,
  type SnowSignSendResult,
} from '@/lib/server/signing/snowsign-client';
import { agreementFixture } from './_agreement-fixture';

vi.mock('@/lib/server/signing/upload-bytes', () => ({
  uploadPdfBytes: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/notifications/operator-signing', () => ({
  notifySigningOperator: vi.fn(),
}));
vi.mock('@/lib/contract-doc/render-pdf', () => ({
  renderContractPdf: vi.fn(async () => ({ bytes: new Uint8Array([1, 2]), fields: [] })),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.clearAllMocks());

async function ready() {
  const f = await agreementFixture();
  const agreement = await getAgreementService();
  await agreement.save(f.contract.id, f.actor, 0, f.parties);
  const view = await agreement.load(f.contract.id, f.actor);
  if (!view.ok || view.mode !== 'agreement' || !view.stamp || !view.signers)
    throw new Error('agreement fixture has no preview');
  const signers = view.signers;
  const client = {
    createUploadSession: vi.fn(async () => ({
      uploadId: 'agreement-race-upload',
      uploadUrl: 'https://example.com/upload',
      expiresAt: new Date().toISOString(),
    })),
    createContract: vi.fn(async () => ({ contractId: 'agreement-race-provider' })),
    sendContract: vi.fn(async (): Promise<SnowSignSendResult> => ({
      contractId: 'agreement-race-provider', status: 'pending', sentAt: new Date().toISOString(),
    })),
    getContract: vi.fn<() => Promise<SnowSignContractDetail>>(),
    cancel: vi.fn(async () => {}),
  };
  __setSnowSignClientForTest(client as unknown as SnowSignClient);
  const detail = (status: string): SnowSignContractDetail => ({
    contractId: 'agreement-race-provider',
    status,
    sentAt: '2026-10-01T01:00:00.000Z',
    participants: [signers.buyer, signers.pg].map((signer) => ({
      ...signer,
      status: status === 'completed' ? 'signed' : 'pending',
      securityMethod: 'identity_verification',
    })),
  });
  return {
    ...f,
    agreement,
    stamp: view.stamp,
    client,
    detail,
    signing: await getContractSigningService(),
    signingRepo: await getSigningContractRepo(),
    agreementRepo: await getAgreementRepo(),
  };
}

describe('공통 합의서 발송과 상태 동기화 경합', () => {
  // Independent, unresolved audit findings. These are expected failures, not
  // guarantees supplied by the expired-lease fix (see docs/audits/2026-10-02-agreement-protocol.md).
  it.fails.each(['in_progress', 'completed'])(
    '%s 웹훅이 발송 응답보다 먼저 와도 문서와 참여자가 커밋된 뒤 상태가 전이한다',
    async (providerStatus) => {
      const f = await ready();
      const sending = deferred<void>();
      const response = deferred<SnowSignSendResult>();
      f.client.sendContract.mockImplementationOnce(() => {
        sending.resolve();
        return response.promise;
      });
      f.client.getContract.mockResolvedValue(f.detail(providerStatus));
      const send = f.signing.sendAgreement(f.contract.id, f.actor, f.stamp);
      await sending.promise;
      const prepared = (await f.agreementRepo.findDraft(f.contract.id))?.prepared;
      expect(prepared).toMatchObject({ _v: 1, feeRows: [{ value: '1.80%' }] });

      // Provider send is in flight. The separately authenticated webhook gets its
      // state from getContract, while the original response is still withheld.
      await f.signing.reconcileByProviderRef('agreement-race-provider');
      const afterWebhook = await f.signingRepo.findById(f.contract.id);
      response.resolve({ contractId: 'agreement-race-provider', status: 'pending' });
      await send;

      expect.soft(afterWebhook?.contract.status).toBe('awaiting_pg_template');
      const afterSend = await f.signingRepo.findById(f.contract.id);
      expect.soft(afterSend?.contract.status).toBe('sent');
      expect.soft(afterSend?.participants).toHaveLength(2);
      expect.soft(await f.signingRepo.findSentDocument(f.contract.id)).toEqual(prepared);
      expect.soft(await f.agreement.load(f.contract.id, f.actor)).toMatchObject({
        mode: 'agreement', editable: false,
      });

      // A later poll recovers the event that arrived before the sent commit.
      await f.signing.reconcileByProviderRef('agreement-race-provider');
      expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe(providerStatus);
    },
  );

  it.fails('발송 성공 뒤 로컬 커밋이 실패해도 웹훅이 문서를 잃지 않고 기존 발송을 복구한다', async () => {
    const f = await ready();
    const persist = vi.spyOn(f.signingRepo, 'insertParticipants')
      .mockRejectedValueOnce(new Error('database commit unavailable'));
    try {
      expect(await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).toMatchObject({
        ok: false, error: 'SEND_FAILED',
      });
    } finally {
      persist.mockRestore();
    }
    const afterFailure = await f.signingRepo.findById(f.contract.id);
    expect(afterFailure?.contract).toMatchObject({
      status: 'awaiting_pg_template', providerRef: 'agreement-race-provider',
    });
    expect(afterFailure?.participants).toHaveLength(0);
    const prepared = (await f.agreementRepo.findDraft(f.contract.id))?.prepared;
    expect(prepared).toBeDefined();

    f.client.getContract.mockResolvedValue(f.detail('completed'));
    await f.signing.reconcileByProviderRef('agreement-race-provider');
    expect.soft((await f.signingRepo.findById(f.contract.id))?.contract.status)
      .toBe('awaiting_pg_template');
    await f.signing.sendAgreement(f.contract.id, f.actor, 'recover');

    const recovered = await f.signingRepo.findById(f.contract.id);
    expect.soft(recovered?.contract.status).toBe('completed');
    expect.soft(recovered?.participants).toHaveLength(2);
    expect.soft(await f.signingRepo.findSentDocument(f.contract.id)).toEqual(prepared);
    // Recovery observes the already sent contract; it must not create or send another.
    expect(f.client.createContract).toHaveBeenCalledOnce();
    expect(f.client.sendContract).toHaveBeenCalledOnce();
  });

  it('합의서 prepared가 없는 기존 템플릿의 대기 계약은 완료 상태를 계속 동기화한다', async () => {
    const f = await ready();
    expect((await f.agreementRepo.findDraft(f.contract.id))?.prepared).toBeNull();
    await f.signingRepo.bindDraftRef(f.contract.id, {
      origin: 'template',
      providerRef: 'agreement-race-provider',
      snowsignTemplateId: 'legacy-template',
    });
    f.client.getContract.mockResolvedValue(f.detail('completed'));
    await f.signing.reconcileByProviderRef('agreement-race-provider');
    expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe('completed');
  });

  // Known independent defect: TODOS.md:437, "in_progress 전이만 CAS 가드가 없다".
  // Kept as an expected failure so this audit retains its deterministic reproducer.
  it.fails('오래 걸린 in_progress 조회가 먼저 완료된 계약을 되살리지 않는다', async () => {
    const f = await ready();
    expect(await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp)).toEqual({ ok: true });
    const reading = deferred<void>();
    const response = deferred<SnowSignContractDetail>();
    f.client.getContract.mockImplementationOnce(() => {
      reading.resolve();
      return response.promise;
    });
    const oldPoll = f.signing.reconcileByProviderRef('agreement-race-provider');
    await reading.promise;

    f.client.getContract.mockResolvedValueOnce(f.detail('completed'));
    await f.signing.reconcileByProviderRef('agreement-race-provider');
    expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe('completed');
    response.resolve(f.detail('in_progress'));
    await oldPoll;

    expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe('completed');
  });
});
