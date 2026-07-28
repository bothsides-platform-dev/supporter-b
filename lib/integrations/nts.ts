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
//   - 회로 차단기(`NTS_BREAKER_OPEN_MS`). `NTS_UPSTREAM_DOWN` 연속 3회면 60초간
//     회로를 열어 네트워크 왕복을 생략하고, 예산이 지나면 탐침 1건으로 복구를
//     확인한다. 판정은 토큰 획득보다 앞서므로 열린 동안에는 버킷도 소모하지 않는다.
//
// 오류 코드 분류 — 저하 모드(가입 무중단)와 알림이 이 경계 위에 서 있다:
//   - `NTS_UPSTREAM_DOWN` : 5xx·hang/timeout = 공급사 장애. 회로 차단기 트립 조건.
//   - `NTS_RATE_LIMIT`    : 429 또는 우리 버킷 고갈. 남용 방어선이라 저하 대상 아님.
//   - `NTS_INVALID_KEY`   : 401/403.
//   - `NTS_NETWORK`       : 전송 실패(TypeError) + 401/403/429 를 뺀 4xx.
//     4xx 가 여기 있는 건 "우리 요청이 계약을 위반했다"는 뜻이라 상위 장애와 달리
//     반드시 보고돼야 하기 때문이다 — 조용히 저하로 넘기면 검증이 영구히 꺼진다.
//
// ⚠️ leaky-bucket · 회로 차단기 한계 (공통)
// 토큰버킷과 브레이커 상태가 모두 모듈 스코프에 들어 있어 **단일 Node 인스턴스
// 안에서만** 공유된다. v1 prod에서 다중 인스턴스(예: Vercel 서버리스, 다중
// 컨테이너) 로 가면 인스턴스마다 10 req/s 버킷과 회로가 별개로 돌아가서 공급사
// 쿼터를 합산으로 초과할 수 있고, 회로도 인스턴스별로 따로 열린다. 그 시점에
// Redis/upstash 로 swap 하거나 게이트웨이 한 단계를 만들 것 — `getNtsClient()`
// 한 군데만 갈아끼면 된다. (현재 PM2 fork 1 인스턴스라 유효.)

import ky, { HTTPError, TimeoutError, type KyInstance } from 'ky';
import * as Sentry from '@sentry/nextjs';

export type NtsLookupResult = {
  valid: boolean;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
};

export type NtsErrorCode =
  | 'NTS_NO_KEY'
  | 'NTS_INVALID_KEY'
  | 'NTS_RATE_LIMIT'
  // 공급사(국세청) 상위 장애 — 5xx 또는 hang/timeout. 저하 모드와 회로 차단기의
  // 트리거이므로 우리 쪽 전송 실패(NTS_NETWORK)와 구분해서 다룬다.
  | 'NTS_UPSTREAM_DOWN'
  // 잔여 버킷: 전송 실패(TypeError) + 401/403/429 를 뺀 4xx(= 우리 요청이 계약을
  // 위반했다는 신호). 상위 장애와 달리 "일어나면 안 되는 일"이라 보고 대상이다.
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

async function acquireTokenBounded(
  sleep: (ms: number) => Promise<void>,
  isExpired: () => boolean = () => false,
): Promise<boolean> {
  if (tryConsumeToken()) return true;
  for (let attempt = 0; attempt < RATE_WAIT_MAX_ATTEMPTS; attempt += 1) {
    if (isExpired()) return false;
    await sleep(RATE_REFILL_MS);
    if (tryConsumeToken()) return true;
  }
  return false;
}

// ─── circuit breaker (in-process) ─────────────────────────────────────────
// 상위(국세청)가 죽었을 때 요청마다 시도당 5초 timeout 을 그대로 기다리는 것을
// 막는다. 연속 실패가 임계를 넘으면 회로를 열어 네트워크 왕복 자체를 생략하고,
// 예산이 지나면 탐침 1건만 흘려 복구를 확인한다.
//
// 트립 조건은 `NTS_UPSTREAM_DOWN`(5xx·hang) 뿐이다 — 401/429/미등록처럼 상위가
// 응답한 결과는 "살아 있다"는 증거이므로 오히려 회로를 닫는다. 이 규칙 덕분에
// half-open 탐침이 비-가용성 오류로 끝나도 상태가 half-open 에 갇히지 않는다.
const BREAKER_FAILURE_THRESHOLD = 3;
export const NTS_BREAKER_OPEN_MS = 60_000;

type BreakerState = 'closed' | 'open' | 'half-open';

const breakerState = {
  state: 'closed' as BreakerState,
  failures: 0,
  openedAt: 0,
};

/** 이 호출을 통과시킬지 판정한다. open → half-open 전이도 여기서 일어난다. */
function breakerAllows(): boolean {
  if (breakerState.state === 'closed') return true;
  // 탐침이 이미 나가 있다 — 결과가 돌아올 때까지 나머지는 막는다.
  if (breakerState.state === 'half-open') return false;
  if (_now() - breakerState.openedAt < NTS_BREAKER_OPEN_MS) return false;
  breakerState.state = 'half-open';
  return true;
}

/**
 * 운영자 알림 — **상태 전이에서만** 1회 보고한다.
 *
 * 관측 사각지대가 이번 장애의 2차 피해였다: `NTS_NETWORK` 는 의도적으로 미보고라
 * 공급사가 며칠 죽어 있어도 사용자 문의 전까지 알 방법이 없었다. 그렇다고 실패마다
 * 보고하면 free plan 5k/mo 를 태운다(`capture.ts` 계약).
 *
 * 그래서 보고 지점은 closed→open 과 (open|half-open)→closed 두 곳뿐이다. 장애가
 * 사흘 이어져도 이벤트는 2건이다 — 실패한 half-open 탐침의 재개방은 보고하지
 * 않는다(60초마다 1건씩 쌓여 예산을 태우므로).
 */
function reportBreakerTransition(kind: 'open' | 'recovered', failures: number): void {
  try {
    Sentry.captureMessage(
      kind === 'open'
        ? 'nts: circuit opened — 국세청 조회가 상위 장애로 저하 모드에 들어감'
        : 'nts: circuit recovered — 국세청 조회 정상화',
      {
        level: kind === 'open' ? 'error' : 'info',
        tags: { integration: 'nts', transition: kind },
        extra: { consecutiveFailures: failures },
      },
    );
  } catch {
    // 텔레메트리가 조회 자체를 깨뜨려서는 안 된다.
  }
}

function breakerRecord(upstreamDown: boolean): void {
  if (!upstreamDown) {
    const wasTripped = breakerState.state !== 'closed';
    breakerState.state = 'closed';
    breakerState.failures = 0;
    if (wasTripped) reportBreakerTransition('recovered', 0);
    return;
  }
  const wasClosed = breakerState.state === 'closed';
  breakerState.failures += 1;
  // half-open 탐침 실패는 카운터와 무관하게 즉시 재개방한다.
  if (
    breakerState.state === 'half-open' ||
    breakerState.failures >= BREAKER_FAILURE_THRESHOLD
  ) {
    breakerState.state = 'open';
    breakerState.openedAt = _now();
    if (wasClosed) reportBreakerTransition('open', breakerState.failures);
  }
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

/**
 * `lookup()` 한 번이 열어 둘 수 있는 총 홀드시간 상한.
 *
 * 재시도 예산(3회 × 백오프 ≈3초)과 leaky-bucket bounded 대기(재시도마다 최대
 * ~1초)는 각자 bounded 지만 서로 누적되고, 개별 시도가 5초 timeout 까지 늘어지면
 * 단일 요청이 20초 넘게 살아 있을 수 있었다. `lookupBizNoAction` 은 가입 플로우용
 * 이라 의도적으로 비인증이고 Caddy 엣지에도 IP 단위 rate limit 이 없어(유일한
 * 방어선이 이 in-process 전역 버킷이다), 소수의 요청만으로 단일 VM 의 커넥션을
 * 묶어둘 수 있는 증폭 경로였다. 캡은 재시도·대기 구성과 무관하게 총합을 자른다.
 *
 * 5초(시도당 timeout)보다 넉넉히 커서, 느리지만 정상인 단일 조회는 그대로 성공한다.
 */
export const NTS_LOOKUP_DEADLINE_MS = 8000;

/**
 * 잡힌 예외를 `NtsError` 로 분류한다. 회로 차단기가 코드를 보고 트립을 결정하므로
 * 매핑과 기록은 반드시 이 한 곳을 지난다.
 */
function toNtsError(e: unknown): NtsError {
  if (e instanceof NtsError) return e;
  // ky는 throwHttpErrors 기본값(true)에 따라 비 2xx 응답을 HTTPError로 throw 한다
  // — status 기반 분기는 res.status 대신 여기서 처리한다.
  if (e instanceof HTTPError) {
    const status = e.response.status;
    if (status === 401 || status === 403) return new NtsError('NTS_INVALID_KEY');
    if (status === 429) return new NtsError('NTS_RATE_LIMIT');
    // 5xx = 공급사 장애. 남은 4xx 는 우리 요청 계약 위반이므로 잔여 버킷으로.
    if (status >= 500) return new NtsError('NTS_UPSTREAM_DOWN', `HTTP ${status}`);
    return new NtsError('NTS_NETWORK', `HTTP ${status}`);
  }
  // hang 도 상위 장애다 — 실측상 장애 중 odcloud 는 30초 매달린 뒤 504 를 준다.
  if (e instanceof TimeoutError || (e as { name?: string })?.name === 'TimeoutError') {
    return new NtsError('NTS_UPSTREAM_DOWN', 'timeout');
  }
  if ((e as { name?: string })?.name === 'AbortError') {
    return new NtsError('NTS_UPSTREAM_DOWN', 'timeout');
  }
  return new NtsError('NTS_NETWORK', (e as Error).message);
}

export type RealNtsClientOpts = {
  /** 테스트 전용 — ky 재시도 딜레이를 결정적으로 만든다 (예: () => 0).
   *  미지정 시 ky 기본 지수 백오프(300/600/1200ms, backoffLimit 1200 캡). */
  retryDelay?: (attemptCount: number) => number;
  /** 테스트 전용 — leaky-bucket bounded 대기의 sleep 을 주입한다.
   *  미지정 시 실제 setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** 테스트 전용 — 총 홀드시간 데드라인을 줄여 실제 abort 를 짧게 검증한다.
   *  미지정 시 `NTS_LOOKUP_DEADLINE_MS`. */
  deadlineMs?: number;
};

export class RealNtsClient implements NtsClient {
  private readonly http: KyInstance;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelay?: (attemptCount: number) => number;
  private readonly deadlineMs: number;

  constructor(opts: RealNtsClientOpts = {}) {
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retryDelay = opts.retryDelay;
    this.deadlineMs = opts.deadlineMs ?? NTS_LOOKUP_DEADLINE_MS;
    // 재시도 설정은 호출별로 넘긴다 — shouldRetry 가 그 호출의 데드라인을
    // 클로저로 잡아야 해서, 클라이언트에 붙이면 `getNtsClient()` 싱글턴을
    // 공유하는 동시 조회끼리 서로의 데드라인을 덮어쓴다.
    this.http = ky.create({ timeout: 5000 });
  }

  async lookup(bizNo: string): Promise<NtsLookupResult> {
    const key = process.env.NTS_SERVICE_KEY;
    if (!key) throw new NtsError('NTS_NO_KEY');

    // 회로 판정은 토큰 획득보다 **앞선다** — 열린 동안의 요청은 발신이 아니므로
    // leaky-bucket 토큰을 태우면 안 된다(태우면 복구 직후 정상 트래픽이 버킷
    // 고갈로 NTS_RATE_LIMIT 을 맞는다).
    if (!breakerAllows()) {
      throw new NtsError('NTS_UPSTREAM_DOWN', 'circuit open');
    }

    // 데드라인은 주입 클록 기준 — 재시도 사이 체크는 테스트에서 결정적으로
    // 구동할 수 있어야 한다. 실시간 하드 실링은 아래 AbortController 가 맡는다.
    const startedAt = _now();
    const isExpired = () => _now() - startedAt >= this.deadlineMs;

    if (!(await acquireTokenBounded(this.sleep, isExpired))) {
      throw new NtsError('NTS_RATE_LIMIT');
    }

    const digits = bizNo.replace(/\D/g, '');

    // isExpired 는 재시도 *사이*에서만 평가된다 — 응답이 영영 오지 않는 단일
    // 요청은 그 체크 지점에 닿지 못하므로, 실시간 abort 로 하드 실링을 둔다.
    const controller = new AbortController();
    const deadlineTimer = setTimeout(() => controller.abort(), this.deadlineMs);

    try {
      const res = await this.http.post(NTS_BASE_URL, {
        signal: controller.signal,
        retry: {
          limit: 3,
          // POST는 ky 기본 재시도 대상 메서드가 아니다 — 명시하지 않으면
          // 429를 받아도 재시도 없이 그대로 throw 된다.
          methods: ['post'],
          statusCodes: [429],
          backoffLimit: 1200,
          ...(this.retryDelay ? { delay: this.retryDelay } : {}),
          shouldRetry: async ({ error }) => {
            // '429만 재시도' — ky 기본 로직은 일반 네트워크 오류(TypeError)도
            // 재시도하므로 위임(undefined) 대신 명시적으로 차단한다.
            if (!(error instanceof HTTPError) || error.response.status !== 429) {
              return false;
            }
            // 남은 예산이 없으면 재시도 한도가 남아 있어도 여기서 끝낸다 —
            // 재시도 예산과 대기 예산이 누적돼 총 홀드시간이 늘어나는 경로.
            if (isExpired()) return false;
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
            return acquireTokenBounded(this.sleep, isExpired);
          },
        },
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

      // HTTP 응답이 왔다 = 상위가 살아 있다. 본문 해석 결과와 무관하게 회로를 닫는다.
      breakerRecord(false);

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
      const err = toNtsError(e);
      breakerRecord(err.code === 'NTS_UPSTREAM_DOWN');
      throw err;
    } finally {
      clearTimeout(deadlineTimer);
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

// 테스트 전용 — 회로 차단기 누적 상태 초기화. 버킷과 별개로 리셋할 수 있어야
// "열린 동안 토큰을 태우지 않는다"를 계량할 수 있다.
export function __resetNtsBreakerForTest(): void {
  breakerState.state = 'closed';
  breakerState.failures = 0;
  breakerState.openedAt = 0;
}

// 테스트 전용 — 버킷 리필 클록 주입 (undefined 로 원복).
export function __setNtsClockForTest(fn: (() => number) | undefined): void {
  _now = fn ?? Date.now;
}
