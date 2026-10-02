import { afterEach, expect, it, vi } from 'vitest';
import { getAgreementService } from '../agreement';
import { getContractSigningService } from '../contract-signing';
import { getAgreementRepo, getSigningContractRepo } from '@/lib/server/repositories/factory';
import {
  __setSnowSignClientForTest,
  SnowSignError,
  type SnowSignClient,
} from '@/lib/server/signing/snowsign-client';
import { agreementFixture } from './_agreement-fixture';
import { EMBED_SEND_LEASE_MS } from '@/lib/signing/embed-lease';
import { uploadPdfBytes } from '@/lib/server/signing/upload-bytes';

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

afterEach(() => {
  vi.useRealTimers();
});

it.each([false, true])('만료 후 동료가 저장하면 옛 발송은 중단하고 새 문서만 보낸다 (동료 발송 준비: %s)', async (prepareB) => {
  const f = await agreementFixture();
  const agreements = await getAgreementService();
  const repo = await getSigningContractRepo();
  await agreements.save(f.contract.id, f.actor, 0, f.parties);
  const viewA = await agreements.load(f.contract.id, f.actor);
  if (!viewA.ok || viewA.mode !== 'agreement' || !viewA.stamp) throw new Error('missing A stamp');

  const createEntered = deferred<void>();
  const createResponse = deferred<{ contractId: string }>();
  const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1_000);
  const client = {
    createUploadSession: vi.fn()
      .mockResolvedValueOnce({ uploadId: 'seed-upload', uploadUrl: 'https://example.com/upload' })
      .mockImplementationOnce(async () => {
        advance(75);
        return { uploadId: 'lease-upload-a', uploadUrl: 'https://example.com/upload' };
      })
      .mockImplementationOnce(async () => {
        if (prepareB) throw new SnowSignError('SNOWSIGN_NETWORK');
        return { uploadId: 'lease-upload-b', uploadUrl: 'https://example.com/upload' };
      })
      .mockResolvedValue({ uploadId: 'lease-upload-b', uploadUrl: 'https://example.com/upload' }),
    createContract: vi.fn()
      .mockResolvedValueOnce({ contractId: 'seed-provider-draft' })
      .mockImplementationOnce(async () => {
        advance(26);
        createEntered.resolve();
        return createResponse.promise;
      }).mockResolvedValue({ contractId: 'lease-provider-b' }),
    sendContract: vi.fn()
      .mockRejectedValueOnce(new SnowSignError('SNOWSIGN_UNREACHABLE'))
      .mockImplementation(async (ref: string) => {
        if (ref === 'lease-provider-a') throw new SnowSignError('SNOWSIGN_NETWORK');
        return { contractId: ref, status: 'pending' };
      }),
    getContract: vi.fn(async () => {
      advance(75);
      return { contractId: 'seed-provider-draft', status: 'draft', participants: [] };
    }),
    cancel: vi.fn(async (ref: string) => {
      if (ref === 'seed-provider-draft') advance(75);
    }),
  } as unknown as SnowSignClient;
  __setSnowSignClientForTest(client);
  const signing = await getContractSigningService();

  // Advance only Date across separate call envelopes: probe 75s + cancel 75s,
  // prepare at 150s, upload-session 75s + upload 50s + create 26s = 301s.
  // The client allows up to 90s per API call with 429 retries (15s per attempt),
  // and upload has a 60s deadline. No single HTTP request must last five minutes.
  // This tests the service's time budget, not real provider latency or retries.
  vi.useFakeTimers({ toFake: ['Date'] });
  const started = new Date('2026-10-02T09:00:00.000Z');
  vi.setSystemTime(started);
  vi.mocked(uploadPdfBytes)
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => { advance(50); });
  // A previous real service attempt leaves a recoverable draft ref. A stale tab
  // can retry with its unchanged, still-valid original preview stamp.
  expect(await signing.sendAgreement(f.contract.id, f.actor, viewA.stamp))
    .toEqual({ ok: false, error: 'SNOWSIGN_UNREACHABLE' });
  vi.mocked(client.sendContract).mockClear();
  const sendA = signing.sendAgreement(f.contract.id, f.actor, viewA.stamp);
  await createEntered.promise;
  expect((await (await getAgreementRepo()).findDraft(f.contract.id))?.prepared?.parties.buyer.company)
    .toBe('계약상호');

  expect(Date.now() - started.getTime()).toBeGreaterThan(EMBED_SEND_LEASE_MS);
  const partiesB = { ...f.parties, buyer: { ...f.parties.buyer, company: '새 계약상호' } };
  expect(await agreements.save(f.contract.id, f.actor, 1, partiesB))
    .toEqual({ ok: true, revision: 2 });
  const viewB = await agreements.load(f.contract.id, f.actor);
  if (!viewB.ok || viewB.mode !== 'agreement' || !viewB.stamp) throw new Error('missing B stamp');
  if (prepareB) {
    expect(await signing.sendAgreement(f.contract.id, f.actor, viewB.stamp))
      .toMatchObject({ ok: false, error: 'SNOWSIGN_NETWORK' });
  }
  const preparedB = (await (await getAgreementRepo()).findDraft(f.contract.id))?.prepared;
  expect(preparedB?.parties.buyer.company).toBe(prepareB ? '새 계약상호' : undefined);

  // A's provider response arrives after B changed the document. A must not bind
  // or send this old PDF, including when B only saved and never reclaimed a lease.
  createResponse.resolve({ contractId: 'lease-provider-a' });
  expect(await sendA).toEqual({ ok: false, error: 'CONTRACT_BUSY' });
  expect(client.sendContract).not.toHaveBeenCalled();
  expect(client.cancel).toHaveBeenCalledWith('lease-provider-a', expect.any(String));
  expect((await repo.findById(f.contract.id))?.contract.providerRef).toBeUndefined();
  expect((await repo.findById(f.contract.id))?.contract.status).toBe('awaiting_pg_template');
  expect((await (await getAgreementRepo()).findDraft(f.contract.id))?.prepared).toEqual(preparedB);

  expect(await signing.sendAgreement(f.contract.id, f.actor, viewB.stamp)).toEqual({ ok: true });
  expect(client.sendContract).toHaveBeenCalledExactlyOnceWith('lease-provider-b');
  expect((await repo.findById(f.contract.id))?.contract.status).toBe('sent');
  const prepared = (await (await getAgreementRepo()).findDraft(f.contract.id))?.prepared;
  expect((await repo.findSentDocument(f.contract.id))?.parties.buyer.company).toBe('새 계약상호');
  expect(await repo.findSentDocument(f.contract.id)).toEqual(prepared);
});
