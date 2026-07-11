import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NtsError,
  RealNtsClient,
  __resetNtsRateLimitForTest,
} from '../nts';

// fetch 전체 스텁 — Response 생성자 대신 최소 형태 객체로 충분하다.
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function ntsRow(row: Record<string, unknown>) {
  return { data: [row] };
}

describe('RealNtsClient.lookup', () => {
  const client = new RealNtsClient();

  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps a registered active 일반과세자 to valid:true/general/active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          200,
          ntsRow({ b_no: '1234567890', b_stt_cd: '01', tax_type: '부가가치세 일반과세자' }),
        ),
      ),
    );
    await expect(client.lookup('123-45-67890')).resolves.toEqual({
      valid: true,
      taxType: 'general',
      status: 'active',
    });
  });

  it.each([
    ['02', 'suspended'],
    ['03', 'closed'],
  ] as const)('maps b_stt_cd %s to status %s', async (code, status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, ntsRow({ b_stt_cd: code, tax_type: '부가가치세 일반과세자' })),
      ),
    );
    await expect(client.lookup('1234567890')).resolves.toMatchObject({
      valid: true,
      status,
    });
  });

  it.each([
    ['부가가치세 간이과세자', 'simple'],
    ['부가가치세 면세사업자', 'exempt'],
  ] as const)('maps tax_type %s to %s', async (text, taxType) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: text }))),
    );
    await expect(client.lookup('1234567890')).resolves.toMatchObject({
      valid: true,
      taxType,
    });
  });

  // 미등록 사업자번호 — API는 200 + b_stt_cd:'' 로 응답한다. throw 가 아니라
  // valid:false 로 반환해야 어댑터가 '찾지 못했어요' 안내를 할 수 있다
  // (MockNtsClient·lookupBizNoAction docstring과 동일 계약).
  it('returns valid:false (no throw) for an unregistered bizNo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          200,
          ntsRow({
            b_no: '0000000000',
            b_stt: '',
            b_stt_cd: '',
            tax_type: '국세청에 등록되지 않은 사업자등록번호입니다.',
          }),
        ),
      ),
    );
    await expect(client.lookup('0000000000')).resolves.toEqual({ valid: false });
  });

  it('returns valid:false when the response has no data row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: [] })));
    await expect(client.lookup('0000000000')).resolves.toEqual({ valid: false });
  });

  it('throws NTS_NO_KEY when the service key env is missing', async () => {
    vi.stubEnv('NTS_SERVICE_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_NO_KEY',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([[401], [403]])('throws NTS_INVALID_KEY on HTTP %d', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status, {})));
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_INVALID_KEY',
    });
  });

  it('throws NTS_RATE_LIMIT on HTTP 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, {})));
    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
  });

  it('throws NTS_NETWORK on HTTP 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(502, {})));
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_NETWORK',
    });
  });

  it('throws NTS_NETWORK when the request aborts (timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        });
      }),
    );
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_NETWORK',
    });
  });
});
