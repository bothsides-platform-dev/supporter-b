// 전자서명 라이프사이클 운영자 슬랙 알림.
//
// ContractSigningService 의 CAS-guarded "실제 전이" 분기(emitAfterCommit 직후)에서만
// 호출된다 — no-op reconcile(cron 폴러)에서는 절대 발화되지 않는다.
//
// after() 를 쓰지 않는 이유: onAward 가 이미 after() 콜백 안에서 실행되고
// (awardRfpAction — 중첩 after 회피), sendSlackMessage 가 never-throw 라
// dangling promise 로 충분하다(Lightsail 장수 Node 프로세스).
//
// 봉인 입찰 경계: 금액·수수료·워크스페이스명은 메시지에 절대 포함하지 않는다 —
// RFP code·제목·이벤트명·회차만.

import { escapeSlackText, sendSlackMessage } from '@/lib/integrations/slack';

export type SigningOperatorEvent =
  | 'awaiting_created'
  | 'sent'
  | 'attached'
  | 'completed'
  | 'declined'
  | 'expired'
  // 마감 없는 계약(조항형)이 오래 열려 있다 — `expired` 와 다르다: 그건 공급자가
  // 종결시킨 **사실**이고, 이건 아무 일도 안 일어나고 있다는 **관측**이다.
  | 'stale_sent'
  | 'canceled';

const EVENT_COPY: Record<SigningOperatorEvent, { emoji: string; label: string }> = {
  awaiting_created: { emoji: '📝', label: '계약 대기 생성' },
  sent: { emoji: '✉️', label: '계약서 발송' },
  attached: { emoji: '🔗', label: '계약서 연결' },
  completed: { emoji: '✅', label: '서명 완료' },
  declined: { emoji: '⛔', label: '서명 거절' },
  expired: { emoji: '⏰', label: '서명 만료' },
  stale_sent: { emoji: '⏳', label: '서명 지연' },
  canceled: { emoji: '🚫', label: '계약 취소' },
};

export interface SigningOperatorNotice {
  event: SigningOperatorEvent;
  rfpCode: string;
  rfpTitle: string;
  round?: number;
}

/**
 * 순수 메시지 빌더 — 단위 테스트용 분리 export (admin-signup subject builder 패턴).
 *
 * 제목은 buyer 가 자유 입력하고(`createRfpAction` 의 `z.string().min(1).max(200)`
 * — 개행·제어문자 제한 없음) 그 값이 그대로 운영 채널에 뜨므로 `escapeSlackText` 를
 * 반드시 통과시킨다. 그 함수가 막는 것은 셋이다 — 채널 핑(`<!channel>`), 위장
 * 링크(`<url|문구>`), 줄 위조(개행). **슬랙 Incoming Webhook 페이로드에는 디스코드의
 * `allowed_mentions` 에 해당하는 멘션 차단 필드가 없어서, 핑을 막는 것은 오직 그
 * 이스케이프뿐이다.**
 *
 * `rfpCode` 는 서버 생성값(`P-2605-0042`)이라 이스케이프하지 않는다. 우리가 씌우는
 * `[코드]` 프레임도 슬랙에서는 문법이 아니라 그냥 글자다.
 */
export function buildSigningOperatorMessage(n: SigningOperatorNotice): string {
  const { emoji, label } = EVENT_COPY[n.event];
  const roundSuffix = n.round && n.round > 1 ? ` (${n.round}회차)` : '';
  return `${emoji} [계약] ${label} — [${n.rfpCode}] ${escapeSlackText(n.rfpTitle)}${roundSuffix}`;
}

/**
 * **never rejects** — 전송 실패가 호출자(서비스 전이 커밋 직후)에 절대 전파되지 않는다.
 *
 * 반환값을 주는 이유는 **배치 경로** 때문이다. 단일 전이 호출부 7곳은 그대로
 * fire-and-forget 이지만(`void notifySigningOperator(...)`), `notifyStaleSent` 는 한 틱에
 * 최대 `limit`(기본 50)건을 돌아 팬아웃 폭이 `limit` 과 1:1로 묶인다 — 거기서 await
 * 하지 않으면 50개가 동시에 나가 소켓 50개를 함께 점유한다. 그래서 그 루프는 await 한다.
 * (직렬화는 **동시성**만 없앤다. 429 는 여전히 난다 — 페이싱이 아니다.)
 *
 * ⚠ `pollPending(limit)` 도 같은 1:1 결합을 갖는다(틱당 최대 50건 reconcile, 종결 전이마다
 * 발화). 거기를 묶지 않은 것은 **결정이지 사실 진술이 아니다** — 그 루프의 지배적 비용은
 * 공급자 왕복이고, 종결 전이가 한 틱에 50건 몰리는 것은 방치 스캔과 달리 정상 상태가
 * 아니다. 그 가정이 깨지면 여기도 같이 묶어야 한다.
 *
 * 동기 throw(빌더가 던지는 경우)도 여기서 삼킨다 — 호출부는 어느 쪽도 볼 일이 없다.
 */
export async function notifySigningOperator(n: SigningOperatorNotice): Promise<void> {
  try {
    await sendSlackMessage({ text: buildSigningOperatorMessage(n) });
  } catch {
    // sendSlackMessage 는 never-throw 지만 방어적으로 한 번 더 감싼다.
  }
}
