import { expect, it, vi } from 'vitest';
vi.mock('@/lib/server/actions/_session', () => ({
  requireActiveWorkspace: vi.fn(async () => ({
    ok: true,
    userId: 'u',
    workspaceId: 'ws',
  })),
}));
vi.mock('@/lib/server/services/agreement', () => ({
  getAgreementService: vi.fn(),
}));
import { getAgreementService } from '@/lib/server/services/agreement';
import { handleAgreementDocument } from '../agreement-document';
import { buildAgreementDocument } from '@/lib/contract-doc/agreement';
import { __resetPreviewRateLimitForTest } from '../preview-rate-limit';
it('구매사의 발송 전 PDF 조회와 PG의 오래된 미리보기 요청을 거부한다', async () => {
  const load = vi.fn(async () => ({
    ok: true,
    mode: 'agreement',
    editable: false,
  }));
  vi.mocked(getAgreementService).mockResolvedValue({ load } as never);
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';
  expect(
    (await handleAgreementDocument(new Request('http://localhost/?stamp=old'), id)).status,
  ).toBe(403);
  load.mockResolvedValueOnce({
    ok: true,
    mode: 'agreement',
    editable: true,
    stamp: 'current',
    snapshot: {},
    parties: {},
  } as never);
  expect(
    (await handleAgreementDocument(new Request('http://localhost/?stamp=old'), id)).status,
  ).toBe(409);
});
it('미리보기 응답에 실제 PDF 바이트와 양측 회사 정보가 있다', async () => {
  const party = {
    company: '테스트 회사',
    bizNo: '1234567890',
    representative: '김대표',
    address: '서울',
  };
  const snapshot = {
    _v: 1,
    doc: buildAgreementDocument('구매사', 'PG사'),
    parties: { buyer: party, pg: party },
    feeRows: [
      {
        label: '계좌이체',
        standard: '2.00%',
        discount: '0.20%p',
        value: '1.80%',
      },
    ],
  };
  vi.mocked(getAgreementService).mockResolvedValue({
    load: async () => ({
      ok: true,
      mode: 'agreement',
      editable: true,
      stamp: 'current',
      parties: snapshot.parties,
      snapshot,
    }),
  } as never);
  const response = await handleAgreementDocument(
    new Request('http://localhost/?stamp=current'),
    'aaaaaaaa-0000-4000-8000-000000000001',
  );
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(1000000);
});

it('조회 실패와 렌더 한도 응답도 개인 문서로 캐시하지 않는다', async () => {
  __resetPreviewRateLimitForTest();
  vi.mocked(getAgreementService).mockResolvedValue({
    load: async () => ({ ok: false, error: 'FORBIDDEN' }),
  } as never);
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';
  const request = new Request('http://localhost/');
  const denied = await handleAgreementDocument(request, id);
  expect(denied.status).toBe(403);
  expect(denied.headers.get('Cache-Control')).toBe('private, no-store');

  for (let i = 1; i < 30; i++) await handleAgreementDocument(request, id);
  const limited = await handleAgreementDocument(request, id);
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Cache-Control')).toBe('private, no-store');
  __resetPreviewRateLimitForTest();
});
