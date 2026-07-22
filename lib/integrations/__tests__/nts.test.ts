import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeoutError } from 'ky';

import {
  NTS_LOOKUP_DEADLINE_MS,
  NtsError,
  RealNtsClient,
  __resetNtsRateLimitForTest,
  __setNtsClockForTest,
} from '../nts';

// fetch 전체 스텁 — ky가 Response.clone()/headers 등에 접근하므로 실제 Response를 사용한다.
function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function ntsRow(row: Record<string, unknown>) {
  return { data: [row] };
}

describe('RealNtsClient.lookup', () => {
  // retryDelay/sleep을 결정적으로 주입해 기존(429 아닌) 테스트들이 실제 백오프로
  // 느려지지 않게 한다 — 재시도 타이밍 자체를 검증하는 것은 아래 별도 describe.
  const client = new RealNtsClient({ retryDelay: () => 0, sleep: async () => {} });

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

describe('RealNtsClient.lookup — upstream 429 auto-retry (ky)', () => {
  // retryDelay: () => 0 로 백오프를 결정적/즉시로 만든다. sleep은 이 그룹에서
  // 쓰이지 않지만(버킷은 매 테스트 beforeEach에서 가득 리필됨) 시그니처상 필요 없음.
  const client = new RealNtsClient({ retryDelay: () => 0 });

  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('retries HTTP 429 with backoff and succeeds on the 3rd attempt', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' })),
      );
    vi.stubGlobal('fetch', fetchSpy);

    // methods:['post']가 빠지면 ky가 POST를 재시도 대상에서 제외해 1회만 호출되고
    // 곧장 NTS_RATE_LIMIT 이 throw 된다 — 이 테스트가 그 누락을 잡는다.
    await expect(client.lookup('1234567890')).resolves.toEqual({
      valid: true,
      taxType: 'general',
      status: 'active',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('throws NTS_RATE_LIMIT after exhausting retries on persistent 429', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(429, {}));
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    // limit:3 → 최초 시도 + 재시도 3회 = 총 4회
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('fails fast without retrying when Retry-After exceeds the wait budget', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '30' }));
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    // Retry-After(30s)가 예산(maxRetryAfter)을 초과 — 재시도 없이 즉시 실패해야 한다.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry on HTTP 401 (invalid key)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(401, {}));
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_INVALID_KEY');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry on HTTP 5xx (network error)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(502, {}));
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_NETWORK');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('RealNtsClient.lookup — local rate-limit bucket bounded wait', () => {
  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    // 실시간 경과로 토큰이 리필되면 호출 횟수 단언이 느린 CI에서 플레이크된다
    // — 클록을 고정해 리필을 차단한다.
    __setNtsClockForTest(() => 5_000_000);
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    __setNtsClockForTest(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('waits for the bucket to refill and then succeeds', async () => {
    // 실제 시간은 흐르게 할 수 없으므로, 주입한 sleep 안에서 버킷 리필을
    // 시뮬레이션한다(__resetNtsRateLimitForTest 재사용 — 최소 변경).
    const sleep = vi.fn(async () => {
      __resetNtsRateLimitForTest();
    });
    const client = new RealNtsClient({ retryDelay: () => 0, sleep });
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' })),
    );
    vi.stubGlobal('fetch', fetchSpy);

    // 버킷(10 토큰)을 완전히 소진한다 — 즉시 성공, sleep 호출 없음.
    for (let i = 0; i < 10; i += 1) {
      await client.lookup('1234567890');
    }
    expect(sleep).not.toHaveBeenCalled();

    // 11번째 호출: 토큰 없음 → 대기 → sleep 내부에서 리필 → 재시도 성공.
    await expect(client.lookup('1234567890')).resolves.toMatchObject({ valid: true });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('throws NTS_RATE_LIMIT once the wait budget is exhausted (bucket stays empty)', async () => {
    const sleep = vi.fn(async () => {});
    const client = new RealNtsClient({ retryDelay: () => 0, sleep });
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' })),
    );
    vi.stubGlobal('fetch', fetchSpy);

    for (let i = 0; i < 10; i += 1) {
      await client.lookup('1234567890');
    }
    fetchSpy.mockClear();

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    expect(fetchSpy).not.toHaveBeenCalled();
    // 최대 10회 × 100ms 대기 예산을 모두 소진했다.
    expect(sleep).toHaveBeenCalledTimes(10);
  });
});

describe('RealNtsClient.lookup — 헤더 인증·재시도 정책 강화 (pre-landing review)', () => {
  const client = new RealNtsClient({ retryDelay: () => 0, sleep: async () => {} });

  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    __setNtsClockForTest(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // 서비스키가 URL 쿼리에 실리면 Sentry breadcrumb 등 요청 URL을 수집하는
  // 모든 로그 표면으로 샌다 — odcloud 표준 Authorization: Infuser 헤더로만 전달.
  it('sends the service key via Authorization: Infuser header, never in the URL', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' })),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await client.lookup('1234567890');

    const [arg] = fetchSpy.mock.calls[0] as unknown as [Request | string | URL];
    const req = arg instanceof Request ? arg : new Request(arg);
    expect(req.url).not.toContain('serviceKey');
    expect(req.headers.get('Authorization')).toBe('Infuser test-key');
  });

  // '429만 재시도' 요구사항 — ky 기본 로직은 일반 네트워크 오류(TypeError)도
  // 재시도하므로, shouldRetry 가 명시적으로 차단해야 한다.
  it('does not retry generic network errors (TypeError)', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchSpy);

    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_NETWORK',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // RFC 7231 Retry-After 는 HTTP-date 형식도 허용 — 초 단위 형식과 동일하게
  // 예산 초과 fail-fast 가 적용되어야 한다.
  it('fails fast on an HTTP-date Retry-After beyond the wait budget', async () => {
    const fetchSpy = vi.fn(async () =>
      jsonResponse(429, {}, { 'Retry-After': 'Fri, 31 Dec 2099 23:59:59 GMT' }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ky 실제 타임아웃은 ky TimeoutError 클래스로 도착한다 — instanceof 분기 직접 검증.
  it('maps ky TimeoutError to NTS_NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TimeoutError(new Request('https://nts.test/status'));
      }),
    );
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_NETWORK',
    });
  });

  // 재시도도 발신 1회다 — 시도(재시도 포함)당 토큰 1개를 소모해야 10 req/s
  // 상한이 429 폭풍에서도 유지된다. 클록을 고정해 리필을 차단하고 계량한다.
  it('consumes one bucket token per retry attempt (throttle applies to retries)', async () => {
    __setNtsClockForTest(() => 1_000_000);
    __resetNtsRateLimitForTest();

    const fail429 = vi.fn(async () => jsonResponse(429, {}));
    vi.stubGlobal('fetch', fail429);
    await expect(client.lookup('1234567890')).rejects.toMatchObject({
      code: 'NTS_RATE_LIMIT',
    });
    // 초기 시도 1 + 재시도 3 = 총 4회 발신 → 토큰 4개 소모 (10 → 6)
    expect(fail429).toHaveBeenCalledTimes(4);

    const ok200 = vi.fn(async () =>
      jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' })),
    );
    vi.stubGlobal('fetch', ok200);
    let successes = 0;
    for (;;) {
      try {
        await client.lookup('1234567890');
        successes += 1;
      } catch {
        break;
      }
    }
    expect(successes).toBe(6);
  });
});

// `lookupBizNoAction` 은 가입 플로우용이라 의도적으로 비인증이고, Caddy 엣지에도
// IP 단위 rate limit 이 없다. 재시도 예산(3회 × 백오프)과 leaky-bucket bounded
// 대기(재시도마다 최대 ~1s)가 서로 누적되면 단일 요청이 20초 넘게 열려 있을 수
// 있어, 소수의 요청만으로 단일 VM 의 커넥션을 묶어둘 수 있었다. 총 홀드시간을
// 재시도·대기 구성과 무관하게 캡으로 잘라낸다.
describe('RealNtsClient.lookup — 총 홀드시간 데드라인', () => {
  // 주입 클록을 테스트가 직접 전진시켜, 느린 업스트림을 실시간 대기 없이 재현한다.
  let now = 0;

  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    now = 1_000_000;
    __setNtsClockForTest(() => now);
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    __setNtsClockForTest(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('느린 429 가 반복되면 재시도 예산이 남아도 데드라인에서 끊는다', async () => {
    const client = new RealNtsClient({ retryDelay: () => 0, sleep: async () => {} });
    // 매 시도가 5초를 잡아먹는 429 — 재시도 한도(3회)를 다 쓰면 20초를 넘긴다.
    const perAttemptMs = 5_000;
    const fetchSpy = vi.fn(async () => {
      now += perAttemptMs;
      return jsonResponse(429, {});
    });
    vi.stubGlobal('fetch', fetchSpy);

    const startedAt = now;
    const err = await client.lookup('1234567890').catch((e) => e);

    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    // 데드라인을 넘긴 시점에 재시도를 포기해야 한다 — limit:3 를 그대로 소진하면 4회.
    const attemptsWithinDeadline = Math.ceil(NTS_LOOKUP_DEADLINE_MS / perAttemptMs);
    expect(fetchSpy).toHaveBeenCalledTimes(attemptsWithinDeadline);
    // 총 홀드시간은 캡 + 진행 중이던 마지막 시도 하나를 넘지 않는다.
    expect(now - startedAt).toBeLessThanOrEqual(NTS_LOOKUP_DEADLINE_MS + perAttemptMs);
  });

  // isExpired 체크는 재시도 *사이*에서만 동작한다 — 응답이 영영 오지 않는 단일
  // 요청은 체크 지점에 도달조차 못 하므로, AbortSignal 로 된 하드 실링이 따로
  // 필요하다. 실제 abort 를 검증해야 해서 여기서만 진짜 타이머를 쓴다(50ms).
  it('응답이 오지 않는 요청도 데드라인에서 잘라낸다', async () => {
    __setNtsClockForTest(undefined); // 실시간 경과가 필요한 유일한 케이스
    const client = new RealNtsClient({ deadlineMs: 50, retryDelay: () => 0, sleep: async () => {} });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (input: Request) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          }),
      ),
    );

    const startedAt = Date.now();
    const err = await client.lookup('1234567890').catch((e) => e);

    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_NETWORK');
    // ky 자체 timeout(5s)이 아니라 우리 데드라인이 먼저 끊었다는 증거.
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('데드라인 안에서 끝나는 느린 요청은 그대로 성공한다', async () => {
    const client = new RealNtsClient({ retryDelay: () => 0, sleep: async () => {} });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        now += NTS_LOOKUP_DEADLINE_MS - 1_000;
        return jsonResponse(200, ntsRow({ b_stt_cd: '01', tax_type: '부가가치세 일반과세자' }));
      }),
    );

    await expect(client.lookup('1234567890')).resolves.toEqual({
      valid: true,
      taxType: 'general',
      status: 'active',
    });
  });
});

describe('RealNtsClient.lookup — Retry-After 파싱 경계', () => {
  const client = new RealNtsClient({ retryDelay: () => 0, sleep: async () => {} });

  beforeEach(() => {
    vi.stubEnv('NTS_SERVICE_KEY', 'test-key');
    __resetNtsRateLimitForTest();
  });

  afterEach(() => {
    __setNtsClockForTest(undefined);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // 숫자도 유효 HTTP-date 도 아니면 afterMs 가 NaN 이 되어 예산 검사를 건너뛰고
  // 일반 재시도 경로로 폴백한다 — 안전한 방향이지만 아무 테스트도 고정하지 않아
  // 반대로 뒤집혀도(즉시 실패) 조용히 통과했다.
  it.each([['garbage'], [''], ['NaN']])(
    'malformed Retry-After (%s) 는 일반 재시도 경로로 폴백한다',
    async (headerValue) => {
      const fetchSpy = vi.fn(async () =>
        jsonResponse(429, {}, { 'Retry-After': headerValue }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      const err = await client.lookup('1234567890').catch((e) => e);
      expect(err).toBeInstanceOf(NtsError);
      expect(err.code).toBe('NTS_RATE_LIMIT');
      // fail-fast 가 아니라 재시도 소진 — 최초 1회 + 재시도 3회.
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    },
  );

  it('예산 이내의 Retry-After 는 fail-fast 하지 않고 재시도한다', async () => {
    // MAX_RETRY_AFTER_MS(1500ms) 이내 — 공급사가 곧 풀어준다는 신호이므로 재시도.
    const fetchSpy = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchSpy);

    const err = await client.lookup('1234567890').catch((e) => e);
    expect(err).toBeInstanceOf(NtsError);
    expect(err.code).toBe('NTS_RATE_LIMIT');
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});
