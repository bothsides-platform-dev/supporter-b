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

/** 순수 메시지 빌더 — 단위 테스트용 분리 export (admin-signup subject builder 패턴). */
export function buildSigningOperatorMessage(n: SigningOperatorNotice): string {
  const { emoji, label } = EVENT_COPY[n.event];
  const roundSuffix = n.round && n.round > 1 ? ` (${n.round}회차)` : '';
  return `${emoji} [계약] ${label} — [${n.rfpCode}] ${n.rfpTitle}${roundSuffix}`;
}

/** 동기 void fire-and-forget — never throws, 호출자(서비스 전이 커밋 직후)에 무영향. */
export function notifySigningOperator(n: SigningOperatorNotice): void {
  try {
    void sendDiscordMessage({ content: buildSigningOperatorMessage(n) });
  } catch {
    // sendDiscordMessage 는 never-throw 지만 방어적으로 한 번 더 감싼다.
  }
}
