/**
 * 웹훅 재조회 인메모리 고정창 리미터 (PM2 단일 fork 전제 — upload-session-budget 과
 * 같은 가정).
 *
 * 웹훅에는 리플레이 방지(타임스탬프/nonce)가 없다 — 같은 (body, signature) 쌍을
 * 무한 재전송할 수 있고, 인증된 요청 1개가 SnowSign `getContract` 1회로 증폭된다.
 * 상태는 전부 CAS 라 부작용은 0이지만 조직 공유 rate limit(100 req/분)은 소모된다.
 * 한도는 정상 웹훅 트래픽(계약당 생애 이벤트 ≤7)보다 훨씬 크고, 공유 한도를 혼자
 * 삼키지는 못하는 수준으로 잡는다. 초과분은 200 ack 만 하고 재조회를 건너뛴다 —
 * 폴링 cron(2분)이 백스톱이라 상태는 잃지 않는다.
 */
const WINDOW_MS = 60_000;
export const WEBHOOK_RECONCILE_LIMIT_PER_MIN = 30;

let windowStart = 0;
let count = 0;

export function allowWebhookReconcile(now: number = Date.now()): boolean {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    count = 0;
  }
  count += 1;
  return count <= WEBHOOK_RECONCILE_LIMIT_PER_MIN;
}

export function __resetWebhookRateLimitForTest(): void {
  windowStart = 0;
  count = 0;
}
