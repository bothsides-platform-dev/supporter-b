// 전자서명 라이프사이클 운영자 슬랙 알림.
//
// ContractSigningService 의 CAS-guarded "실제 전이" 분기(emitAfterCommit 직후)에서만
// 호출된다 — no-op reconcile(1분 cron 폴러)에서는 절대 발화되지 않는다.
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

/** 동기 void fire-and-forget — never throws, 호출자(서비스 전이 커밋 직후)에 무영향. */
export function notifySigningOperator(n: SigningOperatorNotice): void {
  try {
    void sendSlackMessage({ text: buildSigningOperatorMessage(n) });
  } catch {
    // sendSlackMessage 는 never-throw 지만 방어적으로 한 번 더 감싼다.
  }
}
