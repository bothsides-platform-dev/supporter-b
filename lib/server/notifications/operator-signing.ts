// 전자서명 라이프사이클 운영자 디스코드 알림.
//
// ContractSigningService 의 CAS-guarded "실제 전이" 분기(emitAfterCommit 직후)에서만
// 호출된다 — no-op reconcile(1분 cron 폴러)에서는 절대 발화되지 않는다.
//
// after() 를 쓰지 않는 이유: onAward 가 이미 after() 콜백 안에서 실행되고
// (awardRfpAction — 중첩 after 회피), sendDiscordMessage 가 never-throw 라
// dangling promise 로 충분하다(Lightsail 장수 Node 프로세스).
//
// 봉인 입찰 경계: 금액·수수료·워크스페이스명은 메시지에 절대 포함하지 않는다 —
// RFP code·제목·이벤트명·회차만.

import { sendDiscordMessage } from '@/lib/integrations/discord';

export type SigningOperatorEvent =
  | 'awaiting_created'
  | 'sent'
  | 'attached'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';

const EVENT_COPY: Record<SigningOperatorEvent, { emoji: string; label: string }> = {
  awaiting_created: { emoji: '📝', label: '계약 대기 생성' },
  sent: { emoji: '✉️', label: '계약서 발송' },
  attached: { emoji: '🔗', label: '계약서 연결' },
  completed: { emoji: '✅', label: '서명 완료' },
  declined: { emoji: '⛔', label: '서명 거절' },
  expired: { emoji: '⏰', label: '서명 만료' },
  canceled: { emoji: '🚫', label: '계약 취소' },
};

export interface SigningOperatorNotice {
  event: SigningOperatorEvent;
  rfpCode: string;
  rfpTitle: string;
  round?: number;
}

/**
 * 사용자 입력(제목)을 디스코드 운영 채널에 넣기 안전한 **한 줄 리터럴**로 만든다.
 * 제목은 buyer 가 자유 입력하고(`createRfpAction` 의 `z.string().min(1).max(200)`
 * — 개행·제어문자 제한 없음) 그 값이 그대로 운영 채널에 뜬다. 두 가지를 막는다:
 *
 * ① **masked link** — 디스코드는 content 의 `[문구](url)` 를 클릭 가능한 위장
 *    링크로 렌더한다. 대괄호를 이스케이프하되 **백슬래시를 먼저** 이스케이프해야
 *    한다: 대괄호만 처리하면 제목이 이미 담고 있던 `\` 가 우리가 붙인 `\` 를
 *    먹어치워(`\[x\]` → `\\[x\\]`, 디스코드는 `\\` 를 리터럴 백슬래시로 렌더)
 *    대괄호가 다시 문법으로 살아난다. 순서가 곧 방어다.
 * ② **줄 위조** — 개행이 그대로 렌더되므로, 막지 않으면 진짜와 구분되지 않는
 *    가짜 이벤트 줄("✅ [계약] 서명 완료 — …")을 운영 채널에 심을 수 있다.
 *    잘라내지 않고 공백으로 접어 내용은 보존한다.
 *
 * (멘션은 전송층의 allowed_mentions 가 별도로 막는다.)
 */
function sanitizeTitle(s: string): string {
  return (
    s
      // 제어문자(개행·캐리지리턴·탭 포함)를 공백으로 접는다. 리터럴 제어문자를
      // 소스에 두면 편집 중 조용히 깨지므로 \x 이스케이프로만 표기한다.
      .replace(/[\x00-\x1F\x7F]+/g, ' ')
      // 백슬래시 먼저, 그다음 대괄호 — 순서가 뒤집히면 위 ① 이 뚫린다.
      .replace(/([\\[\]])/g, '\\$1')
      .trim()
  );
}

/** 순수 메시지 빌더 — 단위 테스트용 분리 export (admin-signup subject builder 패턴). */
export function buildSigningOperatorMessage(n: SigningOperatorNotice): string {
  const { emoji, label } = EVENT_COPY[n.event];
  const roundSuffix = n.round && n.round > 1 ? ` (${n.round}회차)` : '';
  return `${emoji} [계약] ${label} — [${n.rfpCode}] ${sanitizeTitle(n.rfpTitle)}${roundSuffix}`;
}

/** 동기 void fire-and-forget — never throws, 호출자(서비스 전이 커밋 직후)에 무영향. */
export function notifySigningOperator(n: SigningOperatorNotice): void {
  try {
    void sendDiscordMessage({ content: buildSigningOperatorMessage(n) });
  } catch {
    // sendDiscordMessage 는 never-throw 지만 방어적으로 한 번 더 감싼다.
  }
}
