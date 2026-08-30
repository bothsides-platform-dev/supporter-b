// sendSlackMessage — 운영자 슬랙 채널로 Incoming Webhook 메시지를 직접 발송한다.
//
// 전자서명 라이프사이클·신규 가입 심사처럼 "운영자 채널 1곳"에 가는 best-effort 알림용.
// 트랜잭션 outbox(원자적·재시도)와 달리 커밋 후 fire-and-forget 경로에서 쓰이므로
// 가벼운 직접 전송으로 충분하다(누락돼도 인앱 알림·감사 로그·심사 큐가 durable record).
// admin-email.ts 와 같은 사상, 전송만 Slack webhook.
//
// 모드:
//   - SLACK_WEBHOOK_URL 미설정/빈값: 전송 생략 + `[slack DEV]` 로그, { ok: true }
//   - 설정:                          웹훅 URL 로 JSON POST({ text }) → 결과 매핑
//
// never throws — 실패는 { ok: false } + Sentry 로만 표면화한다.
//
// 슬랙 API 사실(구현이 의존하는 근거):
//   - 성공은 HTTP 200 + 평문 `ok`. 실패는 **상태코드**(400/403/404) + 평문 본문
//     (`invalid_payload`·`no_service`·`invalid_token`…). Web API 와 달리
//     `200 {"ok":false}` 가 없으므로 `res.ok` 만으로 성공 판정이 충분하다.
//   - `text` 는 40,000자에서 하드 절단되고 슬랙 권장은 4,000자다.
//   - `mrkdwn` 은 기본 on, `link_names`/`parse` 는 기본 off. 우리가 원하는 값이 곧
//     기본값이라 **페이로드에 아무 플래그도 싣지 않는다**. 특히 `mrkdwn:false` 는
//     엔티티 디코딩과의 상호작용이 문서화돼 있지 않아 보내지 않는다.
//     **실측 2026-08-30**(실 웹훅 → 실 채널): 평문 `@channel` 은 파란 멘션이 아니라
//     검은 평문으로 렌더되고 핑이 울리지 않는다. 이 한 줄이 중요한 이유는 평문 `@channel`
//     이 `escapeSlackText` 가 손댈 수 없는 유일한 축이기 때문이다 — 꺾쇠 문법이 아니라
//     `link_names` 기본값에만 달려 있어서, 문서가 아니라 실측만이 답이 된다.
//     같은 스모크에서 `<!channel>` 과 `<url|문구>` 도 리터럴로 렌더되는 것을 확인했다.
//   - 레이트 리밋 1건/초(짧은 버스트 허용). `notifyStaleSent` 가 cron 틱 하나에서
//     최대 50건을 쏘므로 429 가 날 수 있다 — best-effort 라 큐를 만들지 않고
//     Sentry 관측으로 둔다(docs/DEPLOY_LIGHTSAIL.md 에 명시).

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/observability/logger';

const SEND_TIMEOUT_MS = 3_000;
// 슬랙 권장 상한(4,000). 하드 절단점은 40,000 이고 **슬랙은 초과분을 400 으로 거절하지
// 않고 조용히 자른다** — 그래서 이 clamp 는 전송 실패를 막는 방어가 아니라 운영 채널에
// 읽을 수 없는 벽이 서는 것을 막는 가독성 상한이다. (디스코드는 2,000 초과에 실제로 400
// 을 냈고, 그 문장을 그대로 옮겨 오면 없는 방어를 설명하는 주석이 된다.)
// 단위는 문자가 아니라 UTF-16 코드 유닛이다(`.slice`) — 제목이 200자 상한이라 도달 불가.
const TEXT_MAX = 4_000;
// 응답 본문은 우리가 통제하지 않는다(프록시가 HTML 에러 페이지를 뱉을 수 있다).
const ERROR_BODY_MAX = 200;

// 한 줄로 접어야 하는 문자들. ASCII 제어문자(\x00-\x1F)와 C1 블록(\x7F-\x9F,
// U+0085 NEL 포함)에 더해 \p{Zl}(U+2028)·\p{Zp}(U+2029), 그리고 \p{Cf} 를 잡는다.
//
// **`\p{Cf}` 가 왜 필요한가**: 줄바꿈만 막으면 "한 줄"은 지켜도 **그 한 줄 안의 순서**가
// 안 지켜진다. U+202E RLO·U+2066~2069 격리자는 줄바꿈 문자가 아니라 위 세 클래스를
// 전부 통과하는데, 통과하면 뒤따르는 글자의 시각 순서를 뒤집는다 — 가입 알림에서 상호
// **뒤에** 붙는 `⚠ 사업자번호 미검증` 배지가 정확히 그 사정권이고, 그 배지는 국세청
// 장애 때 운영자에게 닿는 유일한 경고다. 상호는 셀프 가입 자유 입력이라 무인증 도달 가능.
// U+200D ZWJ 도 함께 접혀 이모지 시퀀스가 낱자로 갈라지지만(예: 👨‍👩‍👦 → 👨 👩 👦)
// 운영 알림에서 이모지 충실도보다 순서 무결성이 우선이라 예외를 두지 않는다.
//
// ⚠ 유니코드 구분자를 **리터럴로 적지 않는 이유**: U+2028/U+2029 는 JS 명세상
// 줄바꿈 문자라, 정규식 리터럴 안에 그대로 넣으면 리터럴이 그 자리에서 끝나
// `Unterminated regular expression literal` 로 파일이 깨진다(이 파일을 쓰다가 실제로
// 겪었다). 게다가 눈에 보이지 않아 diff·Edit 매칭에서도 사고가 난다. 유니코드 속성
// 이스케이프는 전부 ASCII 라 그 두 함정을 동시에 없앤다.
const FOLD_TO_SPACE = /(?:[\x00-\x1F\x7F-\x9F]|\p{Zl}|\p{Zp}|\p{Cf})+/gu;

/**
 * 사용자 입력을 슬랙 채널에 넣기 안전한 **한 줄 리터럴**로 만든다.
 *
 * ① **꺾쇠 이스케이프가 보안 경계의 전부다.** 슬랙의 특수 문법은 전부 `<` 로 시작한다
 *    — `<!channel>`·`<!here>`·`<!everyone>`(채널 핑), `<@U…>`·`<#C…>`·`<!subteam^…>`
 *    (멘션), `<https://evil|안전해 보이는 문구>`(위장 링크). `<`/`>` 를 엔티티로
 *    바꾸면 어느 것도 성립하지 않는다. 디스코드판의 `allowed_mentions:{parse:[]}` 에
 *    해당하는 페이로드 필드가 슬랙 Incoming Webhook 에는 **없으므로**, 채널 핑을
 *    막는 것은 오직 이 함수다.
 * ② **`&` 를 먼저 처리하는 것은 표시 규칙이지 방어가 아니다.** 순서를 뒤집으면
 *    `&lt;` 가 `&amp;lt;` 로 이중 인코딩돼 채널에 `&lt;` 라는 글자가 그대로 보인다.
 *    문법이 되살아나거나 핑이 울리지는 않는다. (디스코드판에서는 백슬래시-우선이
 *    진짜 방어였다 — 그 문장을 여기로 옮겨 쓰면 거짓말이 된다.)
 * ③ **줄 위조** — 개행이 그대로 렌더되므로, 막지 않으면 진짜와 구분되지 않는 가짜
 *    이벤트 줄("✅ [계약] 서명 완료 — …")을 운영 채널에 심을 수 있다. 잘라내지 않고
 *    공백으로 접어 내용은 보존한다(`FOLD_TO_SPACE` 주석 참조).
 *
 * 백슬래시·대괄호는 **건드리지 않는다** — 슬랙은 `[문구](url)` 를 링크로 렌더하지
 * 않고 백슬래시 이스케이프 자체가 없어서, 디스코드 로직을 옮겨 오면 채널에
 * `\[결제 확인\]` 이 문자 그대로 인쇄된다.
 *
 * 남는 것은 대체로 표시 흠집이다: `*`·`_`·`~`·백틱이 굵게/기울임으로 렌더된다.
 *
 * ⚠ **맨 URL 자동 링크는 흠집보다 조금 더 나간다.** 라벨 위조는 못 한다(문구 = URL)는
 * 점에서 masked link 와 다르지만, 가입 알림은 **본문이 두 줄이고 아래 줄이 심사 링크인**
 * 알림이다 — 상호에 URL 을 심으면 진짜 심사 링크 **위에** 클릭 가능한 링크가 하나 더
 * 놓인다. 줄 접기 덕에 아래 줄을 *대체* 하지는 못하므로 치환이 아니라 경쟁이고, 운영
 * 채널은 사내 채널이라 현재는 수용한다. 닫으려면 `://` 를 무해화하는 쪽이 싸다(TODOS).
 *
 * ⚠ ③의 "한 줄" 은 **줄바꿈 문자**에 대한 것이지 시각적 줄 수가 아니다. 삼중 백틱은
 * 개행 문자 없이도 코드블록을 열어 메시지를 여러 줄로 만든다. 막지 않는 이유는 그
 * 블록이 테두리 있는 고정폭 상자로 렌더돼 평문 이벤트 줄을 흉내 낼 수 없기 때문 —
 * 위조가 아니라 흠집이다.
 */
export function escapeSlackText(s: string): string {
  return (
    s
      .replace(FOLD_TO_SPACE, ' ')
      // `&` 먼저 — 순서가 뒤집히면 위 ② 의 이중 인코딩이 난다.
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .trim()
  );
}

export async function sendSlackMessage(args: {
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    // 본문은 **길이만** 남긴다. 디스코드판은 40자 미리보기를 찍었는데 그때는 이 전송층에
    // RFP 제목만 흘렀다 — 지금은 가입 알림의 신청자 실명·상호가 함께 흐르고, 이 로그는
    // PM2 로그로 나가 Sentry 스크러버를 지나지 않는다. 로그의 목적은 "env 가 비었다"를
    // 알리는 것이고 그건 길이만으로 충분하다.
    console.log(`[slack DEV] no SLACK_WEBHOOK_URL set; skipped len=${args.text.length}`);
    return { ok: true };
  }

  try {
    const t0 = Date.now();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` 하나만 싣는다 — 위 헤더 주석의 기본값 근거 참조.
      body: JSON.stringify({ text: args.text.slice(0, TEXT_MAX) }),
      // 행이 멈춘 슬랙이 호출자를 무기한 붙들지 않도록 짧은 타임아웃.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 429 는 **예외가 아니라 예상된 결과**다 — 슬랙 리밋이 1건/초인데
      // `notifyStaleSent` 는 한 틱에 최대 50건을 쏜다. Sentry 로 올리지 않는 이유는
      // 비용이다: `@sentry/node` 기본 통합에 dedupe 가 없어서(실측) 같은 429 가 50개의
      // 개별 이벤트로 나가고, 드롭된 알림 하나마다 아웃바운드 요청이 하나 더 붙는다.
      // 관측은 Axiom 로그로 충분하다.
      if (res.status === 429) {
        // `?.` 는 프로덕션 방어가 아니다 — 실제 Response 의 headers 는 항상 Headers 다.
        // 테스트 더블이 전체 Response 를 흉내 내지 않아도 되게 하는 편의다.
        logger.warn('slack.rate_limited', {
          retryAfter: res.headers?.get?.('retry-after') ?? null,
        });
        // 본문을 안 읽으면 undici 가 소켓을 keep-alive 풀로 못 돌려보낸다. 이 분기는
        // 배치 틱에서 수십 번 연달아 타므로 명시적으로 버린다.
        void res.body?.cancel?.().catch(() => {});
        return { ok: false, error: 'http_429' };
      }
      // 상태코드만으로는 "웹훅이 폐기됨"(invalid_token)과 "슬랙 장애"를 구분할 수
      // 없다 — 평문 본문이 그 차이다. 본문 읽기가 실패해도 전송 결과 판정은 그대로.
      const body = (await res.text().catch(() => '')).slice(0, ERROR_BODY_MAX);
      Sentry.captureException(new Error(`Slack webhook send failed: HTTP ${res.status}`), {
        extra: { context: 'slack', status: res.status, body },
      });
      return { ok: false, error: `http_${res.status}` };
    }
    logger.info('slack.sent', { durationMs: Date.now() - t0 });
    // 성공 본문(`ok`)도 소비하지 않으므로 같은 이유로 버린다.
    void res.body?.cancel?.().catch(() => {});
    return { ok: true };
  } catch (e) {
    Sentry.captureException(e, { extra: { context: 'slack' } });
    // reject 사유가 Error 라는 보장이 없다(문자열·null 도 온다). `(e as Error).message`
    // 는 null 에서 **그 자체가 던져** 이 파일의 never-throws 계약을 깬다.
    return { ok: false, error: e instanceof Error ? e.message : 'slack_threw' };
  }
}
