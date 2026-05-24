// 국세청(NTS) 사업자등록 상태조회 OpenAPI 어댑터.
//
// data.go.kr 공공데이터 — 사업자등록상태조회 (`/nts-businessman/v1/status`).
// `bizNo` 1건을 POST 본문 `{ b_no: ['1234567890'] }` 으로 보내고
// `b_stt_cd`/`tax_type` 코드를 BizProfile 슬림 형태로 매핑한다.
//
// 의존성/제약:
//   - `NTS_SERVICE_KEY` 환경변수 필수. 없으면 `NTS_NO_KEY` throw.
//   - 5초 timeout을 `AbortController`로 강제. 5xx/네트워크는 `NTS_NETWORK`.
//   - leaky-bucket 10 req/s in-process 토큰버킷으로 호출자 throttle.
//
// ⚠️ leaky-bucket 한계
// 토큰버킷이 모듈 스코프 Map 으로 들어 있어 **단일 Node 인스턴스 안에서만**
// 카운트가 공유된다. v1 prod에서 다중 인스턴스(예: Vercel 서버리스, 다중
// 컨테이너) 로 가면 인스턴스마다 10 req/s 버킷이 별개로 돌아가서 공급사
// 쿼터를 합산으로 초과할 수 있다. 그 시점에 Redis/upstash 토큰버킷으로 swap
// 하거나 게이트웨이 한 단계를 만들 것 — `getNtsClient()` 한 군데만 갈아끼면
// 된다.

export type NtsLookupResult = {
  valid: boolean;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
};

export type NtsErrorCode =
  | 'NTS_NO_KEY'
  | 'NTS_INVALID_KEY'
  | 'NTS_RATE_LIMIT'
  | 'NTS_NOT_FOUND'
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

function tryConsumeToken(): boolean {
  const now = Date.now();
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

export class RealNtsClient implements NtsClient {
  async lookup(bizNo: string): Promise<NtsLookupResult> {
    const key = process.env.NTS_SERVICE_KEY;
    if (!key) throw new NtsError('NTS_NO_KEY');

    if (!tryConsumeToken()) throw new NtsError('NTS_RATE_LIMIT');

    const digits = bizNo.replace(/\D/g, '');
    const url = `${NTS_BASE_URL}?serviceKey=${encodeURIComponent(key)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ b_no: [digits] }),
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        throw new NtsError('NTS_INVALID_KEY');
      }
      if (res.status === 429) {
        throw new NtsError('NTS_RATE_LIMIT');
      }
      if (!res.ok) {
        throw new NtsError('NTS_NETWORK', `HTTP ${res.status}`);
      }

      const json = (await res.json()) as {
        data?: Array<{
          b_no?: string;
          b_stt_cd?: string;
          tax_type?: string;
          end_dt?: string;
        }>;
      };
      const row = json?.data?.[0];
      if (!row || !row.b_stt_cd) {
        throw new NtsError('NTS_NOT_FOUND');
      }
      const status = statusFromCode(row.b_stt_cd);
      const taxType = taxTypeFromText(row.tax_type);
      // 등록되지 않은 사업자번호는 b_stt_cd='국세청에 등록되지...' 형태가 아닌
      // 일반 응답 안에서 status undefined 로 나타나는 케이스 — NOT_FOUND.
      if (!status) throw new NtsError('NTS_NOT_FOUND');
      return { valid: true, taxType, status };
    } catch (e) {
      if (e instanceof NtsError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new NtsError('NTS_NETWORK', 'timeout');
      }
      throw new NtsError('NTS_NETWORK', (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Injection point ──────────────────────────────────────────────────────
// 액션 레이어는 `getNtsClient()` 만 호출. 테스트는 `__setNtsClientForTest`로
// MockNtsClient를 갈아끼운다 (auth/_shared.ts:actionDb 패턴 미러).
declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
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
  rateState.lastRefillMs = Date.now();
}
