/**
 * 웹훅 재조회 인메모리 리미터 (PM2 단일 fork 전제 — upload-session-budget 과 같은
 * 가정. `ecosystem.config.cjs` instances:1/fork).
 *
 * 웹훅에는 리플레이 방지(타임스탬프/nonce)가 없다 — 같은 (body, signature) 쌍을
 * 무한 재전송할 수 있고, 인증된 요청 1개가 SnowSign `getContract` 1회로 증폭된다.
 * 상태는 전부 CAS 라 부작용은 0이지만 조직 공유 rate limit(100 req/분)은 소모된다.
 *
 * **계약별 창 + 전역 백스톱의 2단이다.** 전역 카운터 하나면 유효 쌍 하나를 쥔
 * 쪽이 분당 한도만큼 재전송해 창을 상시 포화시키고, 그 동안 **다른 모든 계약**의
 * 웹훅 트리거가 조용히 죽는다(폴링 백스톱뿐). 계약별로 키잉하면 리플레이는 그
 * 계약 하나만 굶기고, 전역 백스톱은 메모리·API 총량을 지킨다. 정상 트래픽은
 * 계약당 생애 이벤트 ≤7 이라 계약별 10/분도 넉넉하다. 초과분은 200 ack 만 하고
 * 재조회를 건너뛴다 — 폴링 cron(2분)이 백스톱이라 상태는 잃지 않는다. 드롭은
 * 호출자(라우트)가 warn 으로 관측한다.
 */
const WINDOW_MS = 60_000;
export const WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT = 10;
// 전역 백스톱은 **지키려는 자원(조직 공유 100 req/분)보다 작아야 한다** — 폴링
// cron 이 최악 틱에 50(POLL_LIMIT)을 쓰고 대화형(발송·다운로드·복구 스캔 ≤16/클릭)
// 여유 ~20 을 남기면 웹훅 몫은 ~30 이다. 100 을 넘게 잡으면 리플레이가 폴링
// 백스톱까지 429 로 죽여 "웹훅 드롭은 폴링이 만회한다"는 전제가 무너진다.
export const WEBHOOK_RECONCILE_GLOBAL_LIMIT = 30;
// 리플레이어가 매번 다른(위조) contract_id 로 맵을 불리는 것을 막는 상한 — 초과 시
// 만료 항목을 정리하고, 그래도 가득이면 새 키는 전역 카운터만 태운다.
const MAX_TRACKED_CONTRACTS = 1_000;

type Win = { windowStart: number; count: number };

let globalWin: Win = { windowStart: 0, count: 0 };
let perContract = new Map<string, Win>();

/** 창을 굴리고 1 소모 — 한도 안이면 true. */
function take(w: Win, now: number, limit: number): boolean {
  if (now - w.windowStart >= WINDOW_MS) {
    w.windowStart = now;
    w.count = 0;
  }
  w.count += 1;
  return w.count <= limit;
}

/**
 * 재조회 예산 1 소모(부수효과 있음 — 이름이 그 사실을 말한다). 반환은 거절 사유:
 * 'ok' | 'contract'(이 계약의 창 포화) | 'global'(전역 백스톱).
 */
export function consumeWebhookReconcileBudget(
  contractId: string,
  now: number = Date.now(),
): 'ok' | 'contract' | 'global' {
  let w = perContract.get(contractId);
  if (!w) {
    if (perContract.size >= MAX_TRACKED_CONTRACTS) {
      for (const [k, v] of perContract) {
        if (now - v.windowStart >= WINDOW_MS) perContract.delete(k);
      }
    }
    if (perContract.size < MAX_TRACKED_CONTRACTS) {
      w = { windowStart: now, count: 0 };
      perContract.set(contractId, w);
    }
  }
  if (w && !take(w, now, WEBHOOK_RECONCILE_LIMIT_PER_CONTRACT)) return 'contract';
  if (!take(globalWin, now, WEBHOOK_RECONCILE_GLOBAL_LIMIT)) return 'global';
  return 'ok';
}

export function __resetWebhookRateLimitForTest(): void {
  globalWin = { windowStart: 0, count: 0 };
  perContract = new Map();
}
