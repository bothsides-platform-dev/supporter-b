import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgreementService } from '../agreement';
import { getContractSigningService } from '../contract-signing';
import {
  getAgreementRepo,
  getSigningContractRepo,
} from '@/lib/server/repositories/factory';
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
  renderContractPdf: vi.fn(async () => ({
    bytes: new Uint8Array([1, 2]),
    fields: [],
  })),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
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
    createContract: vi.fn(async () => ({
      contractId: 'agreement-race-provider',
    })),
    sendContract: vi.fn(
      async (): Promise<SnowSignSendResult> => ({
        contractId: 'agreement-race-provider',
        status: 'pending',
        sentAt: new Date().toISOString(),
      }),
    ),
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
  // Originally independent audit findings. The signer-policy precheck now keeps
  // both early statuses parked until the sent commit persists parties and document.
  async function earlyWebhookBeforeSentCommit(
    providerStatus: 'in_progress' | 'completed',
  ) {
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
    response.resolve({
      contractId: 'agreement-race-provider',
      status: 'pending',
    });
    await send;

    expect.soft(afterWebhook?.contract.status).toBe('awaiting_pg_template');
    const afterSend = await f.signingRepo.findById(f.contract.id);
    expect.soft(afterSend?.contract.status).toBe('sent');
    expect.soft(afterSend?.participants).toHaveLength(2);
    expect
      .soft(await f.signingRepo.findSentDocument(f.contract.id))
      .toEqual(prepared);
    expect.soft(await f.agreement.load(f.contract.id, f.actor)).toMatchObject({
      mode: 'agreement',
      editable: false,
    });

    // A later poll recovers the event that arrived before the sent commit.
    await f.signing.reconcileByProviderRef('agreement-race-provider');
    expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe(
      providerStatus,
    );
  }

  it(
    'in_progress 웹훅이 발송 응답보다 먼저 와도 문서와 참여자가 커밋된 뒤 상태가 전이한다',
    () => earlyWebhookBeforeSentCommit('in_progress'),
  );

  it('completed 웹훅이 발송 응답보다 먼저 오면 당사자 커밋 뒤 후속 폴링에서 완료한다', () =>
    earlyWebhookBeforeSentCommit('completed'));

  it('발송 성공 뒤 로컬 커밋이 실패해도 웹훅이 문서를 잃지 않고 기존 발송을 복구한다', async () => {
    const f = await ready();
    const persist = vi
      .spyOn(f.signingRepo, 'insertParticipants')
      .mockRejectedValueOnce(new Error('database commit unavailable'));
    try {
      expect(
        await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp),
      ).toMatchObject({
        ok: false,
        error: 'SEND_FAILED',
      });
    } finally {
      persist.mockRestore();
    }
    const afterFailure = await f.signingRepo.findById(f.contract.id);
    expect(afterFailure?.contract).toMatchObject({
      status: 'awaiting_pg_template',
      providerRef: 'agreement-race-provider',
    });
    expect(afterFailure?.participants).toHaveLength(0);
    const prepared = (await f.agreementRepo.findDraft(f.contract.id))?.prepared;
    expect(prepared).toBeDefined();

    f.client.getContract.mockResolvedValue(f.detail('completed'));
    await f.signing.reconcileByProviderRef('agreement-race-provider');
    expect
      .soft((await f.signingRepo.findById(f.contract.id))?.contract.status)
      .toBe('awaiting_pg_template');
    await f.signing.sendAgreement(f.contract.id, f.actor, 'recover');

    const recovered = await f.signingRepo.findById(f.contract.id);
    expect.soft(recovered?.contract.status).toBe('completed');
    expect.soft(recovered?.participants).toHaveLength(2);
    expect
      .soft(await f.signingRepo.findSentDocument(f.contract.id))
      .toEqual(prepared);
    // Recovery observes the already sent contract; it must not create or send another.
    expect(f.client.createContract).toHaveBeenCalledOnce();
    expect(f.client.sendContract).toHaveBeenCalledOnce();
  });

  it('당사자 스냅샷이 없는 기존 템플릿 대기 계약은 완료하지 않는다', async () => {
    const f = await ready();
    expect(
      (await f.agreementRepo.findDraft(f.contract.id))?.prepared,
    ).toBeNull();
    await f.signingRepo.bindDraftRef(f.contract.id, {
      origin: 'template',
      providerRef: 'agreement-race-provider',
      snowsignTemplateId: 'legacy-template',
    });
    f.client.getContract.mockResolvedValue(f.detail('completed'));
    expect(
      await f.signing.reconcileByProviderRef('agreement-race-provider'),
    ).toEqual({ ok: false, error: 'SIGNER_POLICY_NOT_ENFORCED' });
    expect((await f.signingRepo.findById(f.contract.id))?.contract.status).toBe(
      'awaiting_pg_template',
    );
  });

  it(
    '오래 걸린 in_progress 조회가 먼저 완료된 계약을 되살리지 않는다',
    async () => {
      const f = await ready();
      expect(
        await f.signing.sendAgreement(f.contract.id, f.actor, f.stamp),
      ).toEqual({ ok: true });
      const reading = deferred<void>();
      const response = deferred<SnowSignContractDetail>();
      f.client.getContract.mockImplementationOnce(() => {
        reading.resolve();
        return response.promise;
      });
      const oldPoll = f.signing.reconcileByProviderRef(
        'agreement-race-provider',
      );
      await reading.promise;

      f.client.getContract.mockResolvedValueOnce(f.detail('completed'));
      await f.signing.reconcileByProviderRef('agreement-race-provider');
      expect(
        (await f.signingRepo.findById(f.contract.id))?.contract.status,
      ).toBe('completed');
      const stale = f.detail('in_progress');
      stale.participants = stale.participants.map((p) => ({ ...p, status: 'viewed' }));
      response.resolve(stale);
      await oldPoll;

      expect(
        (await f.signingRepo.findById(f.contract.id))?.contract.status,
      ).toBe('completed');
      expect((await f.signingRepo.findById(f.contract.id))?.participants.map((p) => p.status))
        .toEqual(['signed', 'signed']);
    },
  );
});
