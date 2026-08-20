/**
 * 조항형 미리보기 렌더 예산 (PM2 단일 fork 전제 — `webhook-rate-limit.ts`·
 * `upload-session-budget` 과 같은 가정. `ecosystem.config.cjs` instances:1/fork).
 *
 * 여기서 지키는 자원은 공급자 API 가 아니라 **우리 CPU 와 메모리**다. 미리보기
 * 한 번이 PDF 문서를 만들고 한글 TTF 두 벌(~5MB)을 **서브셋 없이** 임베드해
 * 수 MB 응답을 만든다(`subset:true` 는 한글 외곽선을 잃어 못 쓴다 — pdf-font.ts).
 * 그리고 이 경로는 공격자만 밟는 것이 아니다: 에디터가 타이핑이 700ms 멎을 때마다
 * **자동으로** 쏘므로 증폭이 정상 사용 루프 안에 있다. 단일 fork 라 흡수할 워커가
 * 없어, 한 사람이 편집기를 켜 두는 것만으로 제품 전체가 느려질 수 있다.
 *
 * **사용자별 창 + 전역 백스톱의 2단이다.** 전역 하나만 두면 한 사람이 창을 포화시켜
 * 다른 PG 담당자 전원의 미리보기가 죽고(그쪽은 아무 잘못이 없다), 사용자별만 두면
 * 총량이 사용자 수만큼 곱해져 지키려던 CPU 가 그대로 샌다.
 */
const WINDOW_MS = 60_000;
// 디바운스가 700ms 라 "쉬지 않고 타이핑"해도 분당 실제 발사는 그보다 훨씬 적다
// (멈춰야 쏜다). 30 이면 정상 편집은 여유롭게 통과하고, 자동 반복 호출은 걸린다.
export const PREVIEW_RENDER_LIMIT_PER_USER = 30;
// 전역은 동시에 편집 중인 담당자 몇 명을 상정한 값 — 지키려는 자원(단일 fork 의
// CPU)보다 작아야 의미가 있다. 넘기면 그 분 동안 새 미리보기만 막히고, 편집·저장·
// 발송은 이 리미터를 지나지 않으므로 영향을 받지 않는다.
export const PREVIEW_RENDER_GLOBAL_LIMIT = 120;
// 사용자 키가 무한히 쌓이는 것을 막는 상한 — 초과 시 만료 항목을 먼저 정리하고,
// 그래도 가득이면 새 키는 전역 카운터만 태운다(= 여전히 총량은 지켜진다).
const MAX_TRACKED_USERS = 1_000;

type Win = { windowStart: number; count: number };

let globalWin: Win = { windowStart: 0, count: 0 };
let perUser = new Map<string, Win>();

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
 * 렌더 예산 1 소모(부수효과 있음 — 이름이 그 사실을 말한다). 반환은 거절 사유:
 * 'ok' | 'user'(이 사용자의 창 포화) | 'global'(전역 백스톱).
 */
export function consumePreviewRenderBudget(
  userId: string,
  now: number = Date.now(),
): 'ok' | 'user' | 'global' {
  let w = perUser.get(userId);
  if (!w) {
    if (perUser.size >= MAX_TRACKED_USERS) {
      for (const [k, v] of perUser) {
        if (now - v.windowStart >= WINDOW_MS) perUser.delete(k);
      }
    }
    if (perUser.size < MAX_TRACKED_USERS) {
      w = { windowStart: now, count: 0 };
      perUser.set(userId, w);
    }
  }
  if (w && !take(w, now, PREVIEW_RENDER_LIMIT_PER_USER)) return 'user';
  if (!take(globalWin, now, PREVIEW_RENDER_GLOBAL_LIMIT)) return 'global';
  return 'ok';
}

export function __resetPreviewRateLimitForTest(): void {
  globalWin = { windowStart: 0, count: 0 };
  perUser = new Map();
}
