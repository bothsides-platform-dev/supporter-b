import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SnowSignError, RealSnowSignClient } from '../snowsign-client';

// fetch 전체 스텁 — ky가 Response.clone()/headers 에 접근하므로 실제 Response 사용.
function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
const ok = (data: unknown) => ({ success: true, data });
const fail = (code: string, message = 'x') => ({ success: false, error: { code, message } });

// ky는 Request 를 fetch 에 넘기고 전송 시 body 스트림을 소비한다 — 요청 본문은
// 반드시 전송 시점(mock 안)에서 캡처해야 한다(전송 후 req.json()은 이미 읽힘).
type Captured = {
  url?: string;
  method?: string;
  apiKey?: string | null;
  body?: Record<string, unknown>;
};
function stubFetchCapturing(response: Response): Captured {
  const cap: Captured = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      cap.url = req.url;
      cap.method = req.method;
      cap.apiKey = req.headers.get('X-API-Key');
      try {
        cap.body = (await req.clone().json()) as Record<string, unknown>;
      } catch {
        cap.body = undefined;
      }
      return response;
    }),
  );
  return cap;
}

// retryDelay 결정적 주입으로 백오프 대기 제거.
const client = new RealSnowSignClient({ retryDelay: () => 0 });

describe('RealSnowSignClient', () => {
  beforeEach(() => {
    vi.stubEnv('SNOWSIGN_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('throws SNOWSIGN_NO_KEY without calling fetch when the API key is missing', async () => {
    vi.stubEnv('SNOWSIGN_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.getStatus('ct_1')).rejects.toMatchObject({ code: 'SNOWSIGN_NO_KEY' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── 고아 복구용 목록 조회 ──────────────────────────────────────────────────
  //
  // 이 경로는 PG 가 버튼을 누르고 **기다리는** 동안 돈다. 클라이언트에는 총 데드라인이
  // 없어(호출당 최악 61초) 호출자가 signal 로 예산을 쥐어야 한다.

  it('listContracts sends status/paging and maps the list envelope', async () => {
    const cap = stubFetchCapturing(
      jsonResponse(200, {
        success: true,
        data: [
          { contract_id: 'ct_a', title: 'A', status: 'pending', created_at: '2026-08-01T00:00:00Z' },
          { contract_id: 'ct_b', title: 'B', status: 'pending', sent_at: '2026-08-01T01:00:00Z' },
        ],
        meta: { pagination: { total_pages: 3 } },
      }),
    );
    const page = await client.listContracts({ status: 'pending', page: 1, perPage: 100 });
    expect(page.rows.map((r) => r.contractId)).toEqual(['ct_a', 'ct_b']);
    expect(page.rows[0]?.createdAt).toBe('2026-08-01T00:00:00Z');
    expect(page.rows[1]?.sentAt).toBe('2026-08-01T01:00:00Z');
    // 잘림 판정을 호출자가 하려면 meta 가 살아 나와야 한다 — request() 는 data 만 돌려준다.
    expect(page.totalPages).toBe(3);
    expect(cap.url).toContain('status=pending');
    expect(cap.url).toContain('per_page=100');
    expect(cap.url).toContain('page=1');
  });

  it('listContracts tolerates a drifted envelope instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ok({ nope: true }))));
    expect(await client.listContracts({ status: 'pending' })).toEqual({ rows: [], totalPages: 1 });
  });

  it('listContracts drops rows without a contract_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ok([{ title: '이름만' }, { contract_id: 'ct_ok' }]))),
    );
    const page = await client.listContracts({ status: 'pending' });
    expect(page.rows.map((r) => r.contractId)).toEqual(['ct_ok']);
  });

  // 재시도 사이에 예산이 끝나면 **다음 시도를 아예 내보내지 않아야** 한다.
  // 이 체크가 없으면 429 폭풍이 시계를 계속 재무장시켜 데드라인이 무의미해진다.
  it('stops retrying once the caller signal aborts', async () => {
    const ac = new AbortController();
    const fetchSpy = vi.fn(async () => {
      ac.abort(); // 첫 응답을 받자마자 예산 소진
      return jsonResponse(429, fail('RATE'));
    });
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.getContract('ct_1', { signal: ac.signal })).rejects.toBeInstanceOf(
      SnowSignError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('getContract still works without opts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ok({ contract_id: 'ct_1', status: 'pending' }))),
    );
    expect((await client.getContract('ct_1')).contractId).toBe('ct_1');
  });

  it.each([
    [404, 'TEMPLATE_NOT_FOUND', 'SNOWSIGN_NOT_FOUND'],
    [403, 'QUOTA_EXCEEDED', 'SNOWSIGN_QUOTA_EXCEEDED'],
    [400, 'VALIDATION_ERROR', 'SNOWSIGN_VALIDATION'],
    [401, 'INVALID_API_KEY', 'SNOWSIGN_INVALID_KEY'],
    [409, 'INVALID_CONTRACT_STATUS', 'SNOWSIGN_INVALID_STATUS'],
    // 실측으로 잡힌 경로 — 스노우싸인이 external_system+external_id 로 임베드 세션을
    // 중복 방지한다. 전용 코드가 없으면 SNOWSIGN_NETWORK 로 뭉개져 "연결하지 못했어요"
    // 라는 엉뚱한 안내가 나간다(원인은 연결이 아니라 이미 열린 세션이다).
    [409, 'EMBED_SESSION_ALREADY_ACTIVE', 'SNOWSIGN_EMBED_SESSION_ACTIVE'],
  ] as const)('maps provider code %s → %s', async (status, providerCode, mapped) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status, fail(providerCode))));
    const e = (await client.getStatus('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe(mapped);
    expect(e.providerCode).toBe(providerCode);
  });

  it('retries 429 then succeeds; persistent 429 → SNOWSIGN_RATE_LIMIT after 1+3 tries', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, fail('RATE')))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          ok({
            contract_id: 'ct',
            status: 'in_progress',
            participants_status: { total: 2, signed: 1, pending: 1 },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchSpy);
    const res = await client.getStatus('ct_1');
    expect(res.status).toBe('in_progress');
    expect(res.participantsStatus?.signed).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const persistent = vi.fn(async () => jsonResponse(429, fail('RATE')));
    vi.stubGlobal('fetch', persistent);
    const e = (await client.getStatus('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e.code).toBe('SNOWSIGN_RATE_LIMIT');
    expect(persistent).toHaveBeenCalledTimes(4);
  });

  // 공유 rate limit(조직 전체 100 req/분)에서 429 는 "언제 다시 와라"를 알려준다 —
  // 무시하고 고정 백오프로 재시도하면 정확히 포화된 순간에 부하를 배가시킨다.
  it('honors Retry-After (seconds) on 429, capped at 10s', async () => {
    const sleeps: number[] = [];
    const c = new RealSnowSignClient({
      retryDelay: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, fail('RATE'), { 'Retry-After': '5' }))
      .mockResolvedValueOnce(
        jsonResponse(200, ok({ contract_id: 'ct', status: 'pending', participants: [] })),
      );
    vi.stubGlobal('fetch', fetchSpy);
    await c.getContract('ct_1');
    expect(sleeps).toEqual([5000]);

    // 터무니없는 값은 10초로 캡 — 대화형 클릭이 몇 분씩 잠기면 안 된다.
    sleeps.length = 0;
    const fetchSpy2 = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, fail('RATE'), { 'Retry-After': '120' }))
      .mockResolvedValueOnce(
        jsonResponse(200, ok({ contract_id: 'ct', status: 'pending', participants: [] })),
      );
    vi.stubGlobal('fetch', fetchSpy2);
    await c.getContract('ct_1');
    expect(sleeps).toEqual([10_000]);
  });

  // (#7) 예산 신호(signal)가 있는 호출은 데드라인 아래에서 돈다 — Retry-After 가
  // 10초를 재우면 12초 복구 데드라인이 안에서 재무장돼 브라우저가 먼저 끊는다.
  it('caps the Retry-After sleep at the backoff cap when a budget signal is present', async () => {
    const sleeps: number[] = [];
    const c = new RealSnowSignClient({
      retryDelay: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const ac = new AbortController();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, fail('RATE'), { 'Retry-After': '8' }))
      .mockResolvedValueOnce(
        jsonResponse(200, ok({ contract_id: 'ct', status: 'pending', participants: [] })),
      );
    vi.stubGlobal('fetch', fetchSpy);
    await c.getContract('ct_1', { signal: ac.signal });
    expect(sleeps).toEqual([2000]);
  });

  // 폴링·복구 스캔은 다음 틱/클릭이 만회한다 — 실패 한 건에 재시도 3회를 태우면
  // 논리 호출 16회가 HTTP 64회로 불어 공유 한도를 혼자 소진한다(추적 P2 의 4배 승수).
  it('respects a per-call maxRetries budget', async () => {
    const persistent = vi.fn(async () => jsonResponse(429, fail('RATE')));
    vi.stubGlobal('fetch', persistent);
    const e = (await client
      .getContract('ct_1', { maxRetries: 1 })
      .catch((x: unknown) => x)) as SnowSignError;
    expect(e.code).toBe('SNOWSIGN_RATE_LIMIT');
    expect(persistent).toHaveBeenCalledTimes(2); // 1 시도 + 1 재시도
  });

  it('retries 5xx (503) then succeeds', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, fail('X')))
      .mockResolvedValueOnce(
        jsonResponse(200, ok({ status: 'sent', participants_status: { total: 1, signed: 0, pending: 1 } })),
      );
    vi.stubGlobal('fetch', fetchSpy);
    const res = await client.getStatus('ct_1');
    expect(res.status).toBe('sent');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry generic network errors (TypeError)', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.getStatus('ct_1')).rejects.toMatchObject({ code: 'SNOWSIGN_NETWORK' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('createEmbedSession returns iframe_url (template_draft)', async () => {
    const cap = stubFetchCapturing(
      jsonResponse(
        200,
        ok({ session_id: 's1', iframe_url: 'https://app.snowsign/embed', code_expires_at: '2026-06-27T12:00:00Z' }),
      ),
    );
    const res = await client.createEmbedSession({
      purpose: 'contract_create',
      allowedOrigins: ['https://partner.support-b.com'],
      flows: ['template_draft'],
      externalSystem: 'supporter-b',
      externalId: 'ws_1',
    });
    expect(res.iframeUrl).toBe('https://app.snowsign/embed');
    expect(cap.url).toContain('/v1/embed-sessions');
    expect(cap.body?.flows).toEqual(['template_draft']);
    expect(cap.body?.allowed_origins).toEqual(['https://partner.support-b.com']);
  });

  it('cancel POSTs reason and resolves void', async () => {
    const cap = stubFetchCapturing(jsonResponse(200, ok({ contract_id: 'ct_1', status: 'cancelled' })));
    await expect(client.cancel('ct_1', '재작성')).resolves.toBeUndefined();
    expect(cap.url).toContain('/v1/contracts/ct_1/cancel');
    expect(cap.body?.reason).toBe('재작성');
  });

  it('downloadUrl returns the presigned URL for a completed contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, ok({ download_url: 'https://s3/x.pdf', filename: 'c.pdf', expires_at: 'z' })),
      ),
    );
    const res = await client.downloadUrl('ct_1');
    expect(res.downloadUrl).toBe('https://s3/x.pdf');
    expect(res.filename).toBe('c.pdf');
  });

  // ── 비정상값 내성 (A1) ────────────────────────────────────────────────────
  it('getContract throws SNOWSIGN_MALFORMED on a 2xx body missing the data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true }))); // no `data`
    const e = (await client.getContract('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  it('getContract coerces a participant with a missing email to "" instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          200,
          ok({
            contract_id: 'ct_1',
            status: 'in_progress',
            participants: [{ name: 'A', status: 'signed' }], // email 누락
          }),
        ),
      ),
    );
    const res = await client.getContract('ct_1');
    expect(res.participants[0]!.email).toBe('');
    expect(res.participants[0]!.name).toBe('A');
    expect(res.participants[0]!.status).toBe('signed');
  });

  it('downloadUrl throws SNOWSIGN_MALFORMED when download_url is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ok({ filename: 'c.pdf' })))); // no url
    const e = (await client.downloadUrl('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  it('downloadUrl throws SNOWSIGN_MALFORMED when download_url is not an absolute URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ok({ download_url: '/relative/x.pdf' }))));
    const e = (await client.downloadUrl('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  it('createEmbedSession throws SNOWSIGN_MALFORMED when session_id is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ok({ iframe_url: 'https://app.snowsign/embed' }))),
    );
    const e = (await client
      .createEmbedSession({ purpose: 'contract_create', allowedOrigins: ['https://x'], flows: ['template_draft'] })
      .catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  // iframe_url 은 `<iframe src>` 가 되는 값이라 download_url 보다 위험한 싱크인데
  // 프로토콜 검증이 없었다(v0.4.35.3 이전). 두 가지를 막는다:
  //   ① 상대 경로·비URL — 프레임 대상이 우리 오리진으로 해석된다.
  //   ② javascript:/data: — `new URL(s).origin` 이 빈 문자열이 아니라 문자열 "null"
  //      이라, SigningSendEmbed 의 `if (!origin || ...)` fail-closed 가드가
  //      트립하지 않는다. 그러면 opaque origin(sandbox·data: 문서)이 보내는
  //      postMessage 의 e.origin 도 "null" 이라 비교를 통과해, 임의 프레임이
  //      goToMapping(공격자 tid) 을 부를 수 있다.
  // 정상 응답(절대 http(s) URL)은 그대로 통과하므로 동작 변화는 없다.
  for (const bad of ['/embed/abc', 'javascript:alert(1)', 'data:text/html,<h1>x', 'not-a-url']) {
    it(`createEmbedSession throws SNOWSIGN_MALFORMED when iframe_url is ${JSON.stringify(bad)}`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, ok({ session_id: 's1', iframe_url: bad }))),
      );
      const e = (await client
        .createEmbedSession({
          purpose: 'contract_create',
          allowedOrigins: ['https://x'],
          flows: ['template_draft'],
        })
        .catch((x: unknown) => x)) as SnowSignError;
      expect(e).toBeInstanceOf(SnowSignError);
      expect(e.code).toBe('SNOWSIGN_MALFORMED');
    });
  }

  it('createEmbedSession accepts an absolute https iframe_url unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, ok({ session_id: 's1', iframe_url: 'https://app.snowsign/embed/abc' })),
      ),
    );
    const res = await client.createEmbedSession({
      purpose: 'contract_create',
      allowedOrigins: ['https://x'],
      flows: ['template_draft'],
    });
    expect(res.iframeUrl).toBe('https://app.snowsign/embed/abc');
  });

  it('auditCertificateUrl throws SNOWSIGN_MALFORMED when download_url is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ok({ filename: 'a.pdf' }))));
    const e = (await client.auditCertificateUrl('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  it('getStatus throws SNOWSIGN_MALFORMED on a 2xx body missing the data envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: true }))); // no data
    const e = (await client.getStatus('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  it('downloadUrl throws SNOWSIGN_MALFORMED for a non-http(s) scheme (redirect-target defense)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, ok({ download_url: 'javascript:alert(1)' }))));
    const e = (await client.downloadUrl('ct_1').catch((x: unknown) => x)) as SnowSignError;
    expect(e).toBeInstanceOf(SnowSignError);
    expect(e.code).toBe('SNOWSIGN_MALFORMED');
  });

  // ── 건별 임베드 발송 경로 (딜룸) ────────────────────────────────────────
  // 임베드는 계약을 브라우저 안에서 만든다 — 서버는 contract_id 를 동기적으로
  // 받지 못하고, external_id 왕복(Q3)과 목록 조회로 그 계약을 되찾아야 한다.

  it('getContract surfaces integration.external_id so the server can verify ownership', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          200,
          ok({
            contract_id: 'ct_1',
            status: 'pending',
            integration: { external_id: 'sc:abc', external_system: 'supporter-b' },
          }),
        ),
      ),
    );
    const res = await client.getContract('ct_1');
    expect(res.externalId).toBe('sc:abc');
  });

  it('getContract also reads a top-level external_id (응답 위치가 실측 전이라 둘 다 본다)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ok({ contract_id: 'ct_1', status: 'pending', external_id: 'sc:xyz' }))),
    );
    expect((await client.getContract('ct_1')).externalId).toBe('sc:xyz');
  });

  it('getContract leaves externalId undefined when the provider echoes nothing (Q3=no)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ok({ contract_id: 'ct_1', status: 'pending' }))),
    );
    expect((await client.getContract('ct_1')).externalId).toBeUndefined();
  });
});

describe('RealSnowSignClient — templates', () => {
  it('createUploadSession() posts purpose/filename/content_type/size_bytes and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            upload_id: 'upl_1',
            upload_url: 'https://s3.example.com/upload',
            fields: { key: 'k' },
            max_size_bytes: 52428800,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createUploadSession({
      purpose: 'template_document',
      filename: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
    });

    expect(result).toEqual({
      uploadId: 'upl_1',
      uploadUrl: 'https://s3.example.com/upload',
      fields: { key: 'k' },
      maxSizeBytes: 52428800,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual({
      purpose: 'template_document',
      filename: 'a.pdf',
      content_type: 'application/pdf',
      size_bytes: 1000,
    });
  });

  it('createTemplate() posts signers + snake_case signature_fields and returns templateId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { template_id: 'tpl_1', name: '표준' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createTemplate({
      name: '표준',
      documentUploadId: 'upl_1',
      signers: ['구매사', 'PG사'],
      signatureFields: [
        { role: '구매사', type: 'signature', pageNumber: 1, positionX: 1, positionY: 2, width: 3, height: 4 },
      ],
    });

    expect(result).toEqual({ templateId: 'tpl_1' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.signers).toEqual(['구매사', 'PG사']);
    expect(body.signature_fields).toEqual([
      { role: '구매사', type: 'signature', page_number: 1, position_x: 1, position_y: 2, width: 3, height: 4, position_unit: 'pixel' },
    ]);
  });

  it('createContractFromTemplate() posts title + participants and returns contractId/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { contract_id: 'c1', status: 'draft' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.createContractFromTemplate('tpl_1', {
      title: '외주 계약서',
      participants: [{ role: '구매사', name: '홍길동', email: 'a@b.com' }],
    });

    expect(result).toEqual({ contractId: 'c1', status: 'draft' });
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/templates/tpl_1/create-contract');
  });

  it('sendContract() posts to /send and returns status + sentAt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { contract_id: 'c1', status: 'pending', sent_at: '2026-01-01T00:00:00Z' } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.SNOWSIGN_API_KEY = 'k';

    const client = new RealSnowSignClient({ retryDelay: () => 0 });
    const result = await client.sendContract('c1');

    expect(result).toEqual({ contractId: 'c1', status: 'pending', sentAt: '2026-01-01T00:00:00Z' });
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/contracts/c1/send');
  });
});

// ── 비멱등 발송 경로의 재시도 정책 ─────────────────────────────────────────
//
// `POST /send`·`POST /create-contract`·`POST /remind` 는 문서상 멱등키
// (`integration.external_id`)를 받지 않는다(docs/SNOWSIGN_API.md — integration 은
// `POST /v1/contracts`·`POST /v1/templates` 에만 있다). 5xx(특히 502/504)는 서버가
// 이미 실행했을 수 있는 **모호 상태**라, 눈감고 재시도하면 서명 요청 메일이 두 통
// 나간다. 429 만은 "처리 전 거절"이 보장되므로 재시도해도 안전하다.
describe('RealSnowSignClient — 비멱등 POST 재시도 정책', () => {
  beforeEach(() => {
    vi.stubEnv('SNOWSIGN_API_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const client = new RealSnowSignClient({ retryDelay: () => 0 });

  it('sendContract() does not retry an ambiguous 502 — the first attempt may already have dispatched emails', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(502, fail('X')));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.sendContract('c1')).rejects.toMatchObject({ code: 'SNOWSIGN_NETWORK' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('createContractFromTemplate() does not retry an ambiguous 504', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(504, fail('X')));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(
      client.createContractFromTemplate('tpl_1', { title: 't', participants: [] }),
    ).rejects.toMatchObject({ code: 'SNOWSIGN_NETWORK' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('remind() does not retry an ambiguous 502 — a retry could email the signer twice', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(502, fail('X')));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.remind('c1')).rejects.toMatchObject({ code: 'SNOWSIGN_NETWORK' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sendContract() still retries 429 — rate-limit rejection happens before execution', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, fail('RATE')))
      .mockResolvedValueOnce(
        jsonResponse(200, ok({ contract_id: 'c1', status: 'pending', sent_at: '2026-01-01T00:00:00Z' })),
      );
    vi.stubGlobal('fetch', fetchSpy);
    const res = await client.sendContract('c1');
    expect(res.status).toBe('pending');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
