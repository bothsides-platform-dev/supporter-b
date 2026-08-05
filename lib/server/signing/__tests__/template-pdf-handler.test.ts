import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Session = { user: { id: string; workspaceId?: string } } | null;
const sessionRef: { value: Session } = { value: null };
// 게이트별 가변 ref — 상수 false 로 박으면 거부 분기가 영구히 실행되지 않아
// 가드를 지워도 스위트가 초록이다(적대 리뷰 지적).
const gateRef = { revoked: false, unverified: false, pgBlocked: false };

vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: async () => gateRef.revoked,
  isEmailUnverified: async () => gateRef.unverified,
}));
vi.mock('@/lib/auth/pg-membership-gate', () => ({
  isPgMembershipBlocked: async () => gateRef.pgBlocked,
}));

import { cappedPdfStream, handleTemplatePdf } from '../template-pdf-handler';
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
  gateRef.revoked = false;
  gateRef.unverified = false;
  gateRef.pgBlocked = false;
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

  it('401 for a revoked session, 403 for an unverified email — service untouched', async () => {
    const getDocumentDownloadUrl = vi.fn();
    setService({ getDocumentDownloadUrl });

    gateRef.revoked = true;
    expect((await handleTemplatePdf('t1')).status).toBe(401);
    gateRef.revoked = false;

    gateRef.unverified = true;
    expect((await handleTemplatePdf('t1')).status).toBe(403);

    expect(getDocumentDownloadUrl).not.toHaveBeenCalled();
  });

  // PG 승인 서버 데이터 경계(v0.4.20.0) — pending_approval/rejected 멤버는 JWT 가
  // 멀쩡해도 PG 전용 데이터에 닿으면 안 된다. 이 라우트는 /api 라 프록시 매처
  // 밖이고, 여기 인라인 게이트가 유일한 게이트다.
  it('403 for a blocked (pending/rejected) PG membership — service untouched', async () => {
    const getDocumentDownloadUrl = vi.fn();
    setService({ getDocumentDownloadUrl });
    gateRef.pgBlocked = true;

    expect((await handleTemplatePdf('t1')).status).toBe(403);
    expect(getDocumentDownloadUrl).not.toHaveBeenCalled();
  });

  it('400 for an empty templateId', async () => {
    expect((await handleTemplatePdf('')).status).toBe(400);
  });

  // 소유권 오라클 접기 — 403(남의 것)과 404(없음)를 가르면 인증 사용자가 임의
  // id 의 존재를 판별할 수 있다(getForActor ACL-먼저 독트린과 동일). 서비스
  // 코드는 로깅용으로 구분을 유지하되 HTTP 경계에서는 둘 다 404.
  it('collapses FORBIDDEN and TEMPLATE_NOT_FOUND to 404, rate limit to 429, provider errors to 502', async () => {
    setService({ getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'FORBIDDEN' })) });
    expect((await handleTemplatePdf('t1')).status).toBe(404);

    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'TEMPLATE_NOT_FOUND' })),
    });
    expect((await handleTemplatePdf('t1')).status).toBe(404);

    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'SNOWSIGN_RATE_LIMIT' })),
    });
    expect((await handleTemplatePdf('t1')).status).toBe(429);

    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: false, error: 'SNOWSIGN_NETWORK' })),
    });
    expect((await handleTemplatePdf('t1')).status).toBe(502);
  });

  it('streams the upstream PDF bytes as application/pdf with no-store and an upstream deadline', async () => {
    const getDocumentDownloadUrl = vi.fn(async () => ({
      ok: true as const,
      url: 'https://s3.example.com/tpl.pdf?sig=1',
    }));
    setService({ getDocumentDownloadUrl });
    const upstreamFetch = vi.fn(async () => new Response('PDFBYTES', { status: 200 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const res = await handleTemplatePdf('t1');

    expect(getDocumentDownloadUrl).toHaveBeenCalledWith({ userId: 'u1', workspaceId: 'ws1' }, 't1');
    // 다른 아웃바운드 홉과 같은 규율 — 데드라인 없는 fetch 는 굳은 S3 연결이
    // PM2 단일 포크의 태스크를 영영 붙든다.
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://s3.example.com/tpl.pdf?sig=1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // Content-Length 는 중계하지 않는다 — undici 가 인코딩을 풀어낸 본문과 원
    // 헤더가 어긋날 수 있어(압축 저장 객체) 런타임 프레이밍에 맡긴다.
    expect(res.headers.get('content-length')).toBeNull();
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

  // provider 가 보관한 원본 파일명을 헤더로 실어 보낸다 — 로컬 DB 에는 파일명이
  // 없어, 이것이 없으면 목록이 `${템플릿이름}.pdf` 를 지어내고 에디터의 같은-PDF
  // 재선택 보존(docMetaRef 이름 대조)이 영영 성립하지 않는다. 한글 파일명은
  // 헤더에 실을 수 없어 URI 인코딩한다.
  it('carries the provider filename as an encoded X-Template-Filename header', async () => {
    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({
        ok: true,
        url: 'https://s3.example.com/x',
        filename: '표준 계약서.pdf',
      })),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PDFBYTES', { status: 200 })));

    const res = await handleTemplatePdf('t1');
    expect(res.headers.get('X-Template-Filename')).toBe(encodeURIComponent('표준 계약서.pdf'));
  });

  it('omits the filename header when the provider gives none', async () => {
    setService({
      getDocumentDownloadUrl: vi.fn(async () => ({ ok: true, url: 'https://s3.example.com/x' })),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PDFBYTES', { status: 200 })));

    const res = await handleTemplatePdf('t1');
    expect(res.headers.get('X-Template-Filename')).toBeNull();
  });

  it('relays a within-cap stream without Content-Length intact', async () => {
    setService({ getDocumentDownloadUrl: vi.fn(async () => ({ ok: true, url: 'https://s3.example.com/x' })) });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('PDFBYTES'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));

    const res = await handleTemplatePdf('t1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('PDFBYTES');
  });
});

// 선언 헤더만 믿으면 Content-Length 를 생략한(chunked) 응답이 캡을 통째로
// 우회한다 — 실제 흘러간 바이트를 세는 스트림 상한. 실물 50MB 를 테스트에서
// 흘리면 워커가 죽으므로 작은 상한으로 로직만 검증한다(핸들러는 상수를 주입).
describe('cappedPdfStream', () => {
  function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });
  }

  it('passes a stream whose total stays at or under the cap', async () => {
    const capped = cappedPdfStream(streamOf('abcd', 'efgh'), 8);
    const text = await new Response(capped).text();
    expect(text).toBe('abcdefgh');
  });

  it('errors the stream once cumulative bytes exceed the cap (no declared length needed)', async () => {
    const capped = cappedPdfStream(streamOf('abcd', 'efgh', 'i'), 8);
    await expect(new Response(capped).text()).rejects.toThrow();
  });
});
