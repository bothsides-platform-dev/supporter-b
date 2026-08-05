import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Session = { user: { id: string; workspaceId?: string } } | null;
const sessionRef: { value: Session } = { value: null };

vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: async () => false,
  isEmailUnverified: async () => false,
}));

import { handleTemplatePdf } from '../template-pdf-handler';
import {
  __resetSigningTemplateServiceForTest,
  __setSigningTemplateServiceForTest,
  type SigningTemplateService,
} from '@/lib/server/services/signing-template';
import { SIGNING_TEMPLATE_PDF_MAX_BYTES } from '@/lib/signing/template-limits';

function setService(overrides: Record<string, unknown>) {
  __setSigningTemplateServiceForTest(overrides as unknown as SigningTemplateService);
}

beforeEach(() => {
  sessionRef.value = { user: { id: 'u1', workspaceId: 'ws1' } };
});
afterEach(() => {
  sessionRef.value = null;
  __resetSigningTemplateServiceForTest();
  vi.unstubAllGlobals();
});

// 계약 완료본 프록시(download-handler)는 302 지만, 여기는 **바이트 스트리밍**이다 —
// 소비자가 탭 내비게이션이 아니라 에디터의 fetch(pdf.js 렌더 + 저장 시 재업로드)라
// S3 CORS 에 종속되면 안 된다. 오류도 HTML 페이지가 아니라 상태코드로 답한다.
describe('handleTemplatePdf', () => {
  it('401 when unauthenticated', async () => {
    sessionRef.value = null;
    const res = await handleTemplatePdf('t1');
    expect(res.status).toBe(401);
  });

  it('403 when the session has no workspace', async () => {
    sessionRef.value = { user: { id: 'u1' } };
    const res = await handleTemplatePdf('t1');
    expect(res.status).toBe(403);
  });

  it('maps service errors to HTTP status (403 FORBIDDEN, 404 TEMPLATE_NOT_FOUND, 502 provider)', async () => {
    setService({ getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'FORBIDDEN' })) });
    expect((await handleTemplatePdf('t1')).status).toBe(403);

    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'TEMPLATE_NOT_FOUND' })),
    });
    expect((await handleTemplatePdf('t1')).status).toBe(404);

    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'SNOWSIGN_NETWORK' })),
    });
    expect((await handleTemplatePdf('t1')).status).toBe(502);
  });

  it('streams the upstream PDF bytes as application/pdf with no-store', async () => {
    const getDocumentDownloadUrl = vi.fn(async () => ({
      ok: true as const,
      url: 'https://s3.example.com/tpl.pdf?sig=1',
    }));
    setService({ getDocumentDownloadUrl });
    const upstreamFetch = vi.fn(async () => new Response('PDFBYTES', { status: 200 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const res = await handleTemplatePdf('t1');

    expect(getDocumentDownloadUrl).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'ws1' }, 't1');
    expect(upstreamFetch).toHaveBeenCalledWith('https://s3.example.com/tpl.pdf?sig=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.text()).toBe('PDFBYTES');
  });

  it('502 when the upstream download fails or rejects', async () => {
    setService({ getDocumentDownloadUrl: vi.fn(async () => ({ ok: true, url: 'https://s3.example.com/x' })) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    expect((await handleTemplatePdf('t1')).status).toBe(502);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('net'))));
    expect((await handleTemplatePdf('t1')).status).toBe(502);
  });

  // 방어적 상한 — 우리가 올린 파일은 이미 50MB 캡 아래지만, provider 가 엉뚱한
  // 것을 돌려줘도 그대로 중계하지 않는다.
  it('502 when the upstream declares a size over the PDF cap', async () => {
    setService({ getDocumentDownloadUrl: vi.fn(async () => ({ ok: true, url: 'https://s3.example.com/x' })) });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('big', {
            status: 200,
            headers: { 'Content-Length': String(SIGNING_TEMPLATE_PDF_MAX_BYTES + 1) },
          }),
      ),
    );
    expect((await handleTemplatePdf('t1')).status).toBe(502);
  });
});
