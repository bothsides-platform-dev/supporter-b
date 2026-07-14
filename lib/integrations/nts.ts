// 국세청(NTS) 사업자등록 상태조회 OpenAPI 어댑터.
//
// data.go.kr 공공데이터 — 사업자등록상태조회 (`/nts-businessman/v1/status`).
// `bizNo` 1건을 POST 본문 `{ b_no: ['1234567890'] }` 으로 보내고
// `b_stt_cd`/`tax_type` 코드를 BizProfile 슬림 형태로 매핑한다.
//
// 의존성/제약:
//   - `NTS_SERVICE_KEY` 환경변수 필수. 없으면 `NTS_NO_KEY` throw. 키는 URL
//     쿼리가 아닌 `Authorization: Infuser` 헤더로만 전달한다 (쿼리에 실으면
//     Sentry breadcrumb 등 요청 URL 로그 표면으로 유출).
//   - HTTP 클라이언트는 `ky`(시도당 5초 timeout). **429(Rate Limit)만** 자동
//     재시도한다 — 최대 3회, 지수 백오프 300/600/1200ms(≈3초 예산).
//     401/403/5xx/timeout은 물론 일반 네트워크 오류(TypeError)도 재시도하지
//     않는다(ky 기본은 네트워크 오류 재시도 — shouldRetry가 명시 차단).
//     `Retry-After` 헤더(초 단위·HTTP-date 모두)가 1.5초(`MAX_RETRY_AFTER_MS`)
//     예산을 초과하면(공급사 쿼터 소진으로 판단) 재시도 없이 즉시
//     `NTS_RATE_LIMIT` throw — ky의 내장 `retry.maxRetryAfter`는 초과 시에도
//     delay만 캡하고 재시도를 계속하므로(캡&재시도, fail-fast 아님) 이
//     fail-fast는 커스텀 `shouldRetry` 콜백으로 직접 구현했다.
//   - leaky-bucket 10 req/s in-process 토큰버킷으로 호출자 throttle. 토큰이
//     없으면 즉시 실패하지 않고 최대 10회 × 100ms(≈1초 예산) bounded 대기 후
//     재획득을 시도한다 — 100ms마다 토큰이 1개씩 회복되므로 현실적인 버스트는
//     대부분 이 안에서 구제된다. 예산을 다 써도 토큰을 못 얻으면 `NTS_RATE_LIMIT`.
//     **재시도도 발신 1회로 계량** — shouldRetry가 재시도 직전마다 토큰을
//     소모하므로 429 폭풍에서도 10 req/s 상한이 유지된다.
//
// ⚠️ leaky-bucket 한계
// 토큰버킷이 모듈 스코프 Map 으로 들어 있어 **단일 Node 인스턴스 안에서만**
// 카운트가 공유된다. v1 prod에서 다중 인스턴스(예: Vercel 서버리스, 다중
// 컨테이너) 로 가면 인스턴스마다 10 req/s 버킷이 별개로 돌아가서 공급사
// 쿼터를 합산으로 초과할 수 있다. 그 시점에 Redis/upstash 토큰버킷으로 swap
// 하거나 게이트웨이 한 단계를 만들 것 — `getNtsClient()` 한 군데만 갈아끼면
// 된다.

import ky, { HTTPError, TimeoutError, type KyInstance } from 'ky';

export type NtsLookupResult = {
  valid: boolean;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
};

export type NtsErrorCode =
  | 'NTS_NO_KEY'
  | 'NTS_INVALID_KEY'
  | 'NTS_RATE_LIMIT'
  | 'NTS_NETWORK';

export class NtsError extends Error {
  constructor(public readonly code: NtsErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'NtsError';
  }
}

export interface NtsClient {
  lookup(bizNo: string): Promise<NtsLookupResult>;
}

// ─── leaky-bucket (in-process) ────────────────────────────────────────────
// 매 100ms마다 토큰 1개 회복 → 정상 상태에서 10 req/s. 단일 인스턴스 가정.
const RATE_REFILL_MS = 100;
const RATE_BUCKET_MAX = 10;

const rateState = {
  tokens: RATE_BUCKET_MAX,
  lastRefillMs: Date.now(),
};

// 테스트에서 클록을 고정할 수 있게 주입점을 둔다 — 실시간 경과로 토큰이
// 리필되면 호출 횟수 단언이 느린 CI에서 플레이크된다.
let _now: () => number = Date.now;

function tryConsumeToken(): boolean {
  const now = _now();
  const elapsed = now - rateState.lastRefillMs;
  if (elapsed >= RATE_REFILL_MS) {
    const refill = Math.floor(elapsed / RATE_REFILL_MS);
    rateState.tokens = Math.min(RATE_BUCKET_MAX, rateState.tokens + refill);
    rateState.lastRefillMs = now;
  }
  if (rateState.tokens <= 0) return false;
  rateState.tokens -= 1;
  return true;
}

// 즉시 실패 대신 bounded 대기 후 재획득을 시도한다. 100ms당 토큰 1개가
// 회복되므로 최대 10회 대기(≈1초 예산) 안에서 현실적인 버스트는 대부분
// 구제된다. 예산을 다 쓰면 false — 호출자가 NTS_RATE_LIMIT 을 throw 한다.
const RATE_WAIT_MAX_ATTEMPTS = 10;

async function acquireTokenBounded(sleep: (ms: number) => Promise<void>): Promise<boolean> {
  if (tryConsumeToken()) return true;
  for (let attempt = 0; attempt < RATE_WAIT_MAX_ATTEMPTS; attempt += 1) {
    await sleep(RATE_REFILL_MS);
    if (tryConsumeToken()) return true;
  }
  return false;
}

// ─── 코드 매핑 ────────────────────────────────────────────────────────────
// b_stt_cd: 01 계속사업자, 02 휴업자, 03 폐업자
// tax_type 코드는 텍스트 응답이라 부분 매칭으로 일반/간이/면세 분류.
function statusFromCode(code: string | undefined): NtsLookupResult['status'] {
  if (code === '01') return 'active';
  if (code === '02') return 'suspended';
  if (code === '03') return 'closed';
  return undefined;
}

function taxTypeFromText(t: string | undefined): NtsLookupResult['taxType'] {
  if (!t) return undefined;
  if (t.includes('면세')) return 'exempt';
  if (t.includes('간이')) return 'simple';
  if (t.includes('일반') || t.includes('과세')) return 'general';
  return undefined;
}

// ─── Real client ──────────────────────────────────────────────────────────
const NTS_BASE_URL =
  process.env.NTS_API_URL ??
  'https://api.odcloud.kr/api/nts-businessman/v1/status';

// Retry-After가 이 예산(ms)을 초과하면 공급사 쿼터 소진으로 보고 재시도 없이
// 즉시 실패한다. ky의 내장 `maxRetryAfter`는 초과분을 캡할 뿐 재시도는
// 계속하므로(2xx가 아닌 이상 계속 대기+재시도) 여기서는 안 쓰고 `shouldRetry`
// 로 직접 판단한다.
const MAX_RETRY_AFTER_MS = 1500;

export type RealNtsClientOpts = {
  /** 테스트 전용 — ky 재시도 딜레이를 결정적으로 만든다 (예: () => 0).
   *  미지정 시 ky 기본 지수 백오프(300/600/1200ms, backoffLimit 1200 캡). */
  retryDelay?: (attemptCount: number) => number;
  /** 테스트 전용 — leaky-bucket bounded 대기의 sleep 을 주입한다.
   *  미지정 시 실제 setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

export class RealNtsClient implements NtsClient {
  private readonly http: KyInstance;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RealNtsClientOpts = {}) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.http = ky.create({
      timeout: 5000,
      retry: {
        limit: 3,
        // POST는 ky 기본 재시도 대상 메서드가 아니다 — 명시하지 않으면
        // 429를 받아도 재시도 없이 그대로 throw 된다.
        methods: ['post'],
        statusCodes: [429],
        backoffLimit: 1200,
        ...(opts.retryDelay ? { delay: opts.retryDelay } : {}),
        shouldRetry: async ({ error }) => {
          // '429만 재시도' — ky 기본 로직은 일반 네트워크 오류(TypeError)도
          // 재시도하므로 위임(undefined) 대신 명시적으로 차단한다.
          if (!(error instanceof HTTPError) || error.response.status !== 429) {
            return false;
          }
          const retryAfter = error.response.headers.get('Retry-After');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            // RFC 7231: 초 단위 또는 HTTP-date — 두 형식 모두 예산을 검사한다.
            const afterMs = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(afterMs) && afterMs > MAX_RETRY_AFTER_MS) {
              return false; // 쿼터 소진으로 판단 — 재시도 없이 즉시 실패
            }
          }
          // 재시도도 발신 1회다 — 시도당 토큰을 소모해 10 req/s 상한을
          // 재시도에도 적용한다 (토큰 고갈 시 재시도 포기 → 429 그대로 실패).
          return acquireTokenBounded(this.sleep);
        },
      },
    });
  }

  async lookup(bizNo: string): Promise<NtsLookupResult> {
    const key = process.env.NTS_SERVICE_KEY;
    if (!key) throw new NtsError('NTS_NO_KEY');

    if (!(await acquireTokenBounded(this.sleep))) {
      throw new NtsError('NTS_RATE_LIMIT');
    }

    const digits = bizNo.replace(/\D/g, '');

    try {
      const res = await this.http.post(NTS_BASE_URL, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // 서비스키는 URL 쿼리가 아닌 헤더로만 전달한다 — 쿼리에 실으면
          // Sentry breadcrumb 등 요청 URL을 수집하는 모든 로그 표면으로 샌다.
          // odcloud 표준 헤더 인증. 헤더 값은 원문 그대로(URL 인코딩 금지).
          Authorization: `Infuser ${key}`,
        },
        body: JSON.stringify({ b_no: [digits] }),
      });

      const json = (await res.json()) as {
        data?: Array<{
          b_no?: string;
          b_stt_cd?: string;
          tax_type?: string;
          end_dt?: string;
        }>;
      };
      // 미등록 사업자번호는 HTTP 200 + b_stt_cd 빈값으로 온다. 오류가 아닌
      // 정상 결과이므로 valid:false 반환 — MockNtsClient·액션 docstring과
      // 같은 계약 (throw 하면 UI가 '시스템 오류'로 오안내).
      const row = json?.data?.[0];
      if (!row || !row.b_stt_cd) {
        return { valid: false };
      }
      const status = statusFromCode(row.b_stt_cd);
      const taxType = taxTypeFromText(row.tax_type);
      if (!status) return { valid: false };
      return { valid: true, taxType, status };
    } catch (e) {
      if (e instanceof NtsError) throw e;
      // ky는 throwHttpErrors 기본값(true)에 따라 비 2xx 응답을 HTTPError로
      // throw 한다 — status 기반 분기는 res.status 대신 여기서 처리한다.
      if (e instanceof HTTPError) {
        const status = e.response.status;
        if (status === 401 || status === 403) throw new NtsError('NTS_INVALID_KEY');
        if (status === 429) throw new NtsError('NTS_RATE_LIMIT');
        throw new NtsError('NTS_NETWORK', `HTTP ${status}`);
      }
      if (e instanceof TimeoutError || (e as { name?: string })?.name === 'TimeoutError') {
        throw new NtsError('NTS_NETWORK', 'timeout');
      }
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new NtsError('NTS_NETWORK', 'timeout');
      }
      throw new NtsError('NTS_NETWORK', (e as Error).message);
    }
  }
}

// ─── Injection point ──────────────────────────────────────────────────────
// 액션 레이어는 `getNtsClient()` 만 호출. 테스트는 `__setNtsClientForTest`로
// MockNtsClient를 갈아끼운다 (auth/_shared.ts:actionDb 패턴 미러).
declare global {
  var __bidit_nts_client__: NtsClient | undefined;
}

let _real: RealNtsClient | undefined;

export function getNtsClient(): NtsClient {
  if (globalThis.__bidit_nts_client__) return globalThis.__bidit_nts_client__;
  if (!_real) _real = new RealNtsClient();
  return _real;
}

export function __setNtsClientForTest(client: NtsClient | undefined): void {
  globalThis.__bidit_nts_client__ = client;
}

// 테스트 전용 — leaky-bucket 누적 상태 초기화.
export function __resetNtsRateLimitForTest(): void {
  rateState.tokens = RATE_BUCKET_MAX;
  rateState.lastRefillMs = _now();
}

// 테스트 전용 — 버킷 리필 클록 주입 (undefined 로 원복).
export function __setNtsClockForTest(fn: (() => number) | undefined): void {
  _now = fn ?? Date.now;
}
