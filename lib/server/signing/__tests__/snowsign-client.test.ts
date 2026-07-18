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

  it('createContractFromTemplate POSTs to the template endpoint with X-API-Key + external_id', async () => {
    const cap = stubFetchCapturing(
      jsonResponse(201, ok({ contract_id: 'ct_1', title: 'T', status: 'draft' })),
    );

    const res = await client.createContractFromTemplate('tmpl_1', {
      title: '홍길동 계약',
      participants: [
        { name: '구매담당', email: 'b@x.com', role: '구매사', securityMethod: 'easy_cert' },
      ],
      variables: { 수수료율: '2.5%' },
      externalId: 'sc_123',
    });
    expect(res.contractId).toBe('ct_1');
    expect(res.status).toBe('draft');

    expect(cap.url).toContain('/v1/templates/tmpl_1/create-contract');
    expect(cap.method).toBe('POST');
    expect(cap.apiKey).toBe('test-key');
    const integration = cap.body?.integration as { external_id?: string };
    expect(integration.external_id).toBe('sc_123'); // 멱등 키
    const participants = cap.body?.participants as Array<{
      role: string;
      security?: { method: string };
    }>;
    expect(participants[0]!.role).toBe('구매사');
    expect(participants[0]!.security?.method).toBe('identity_verification'); // easy_cert 매핑
  });

  it('throws SNOWSIGN_NO_KEY without calling fetch when the API key is missing', async () => {
    vi.stubEnv('SNOWSIGN_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.getStatus('ct_1')).rejects.toMatchObject({ code: 'SNOWSIGN_NO_KEY' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'TEMPLATE_NOT_FOUND', 'SNOWSIGN_NOT_FOUND'],
    [403, 'QUOTA_EXCEEDED', 'SNOWSIGN_QUOTA_EXCEEDED'],
    [400, 'VALIDATION_ERROR', 'SNOWSIGN_VALIDATION'],
    [401, 'INVALID_API_KEY', 'SNOWSIGN_INVALID_KEY'],
    [409, 'INVALID_CONTRACT_STATUS', 'SNOWSIGN_INVALID_STATUS'],
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
});
