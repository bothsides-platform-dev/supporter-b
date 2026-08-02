/**
 * 발송 리스 이어받기 알림의 판정 — 서버가 보낸 알림 하나가 "이 딜의 것"인지.
 *
 * 이 알림은 단순한 통지가 아니라 **차단 신호**다: 받은 브라우저는 열어 둔 발송
 * 임베드를 즉시 내린다(스노우싸인에 세션 취소 API 가 없어, 우리 iframe 을 내리는
 * 것이 실제 차단이다). 그래서 잘못 매칭되면 대가가 양방향으로 크다 — 남의 딜 알림에
 * 닫히면 작성 중이던 계약서가 날아가고, 자기 딜 알림을 놓치면 뺏긴 화면으로 발송해
 * 계약이 두 건 살아난다.
 *
 * 딜 식별은 알림의 `linkUrl` 마지막 경로 세그먼트로 한다 — 알림 스키마에 견적번호
 * 필드가 따로 없고, 이 링크가 곧 그 딜룸이다. **경로 세그먼트 경계로 고정**한다:
 * 접두어 매칭이면 `P-2608-00012` 알림이 `P-2608-0001` 화면을 닫는다. 서버가 이
 * 링크 모양을 바꾸면 신호가 조용히 죽으므로 서비스 테스트가 반대편을 함께 못박는다.
 */
export const SEND_TAKEN_OVER_TYPE = 'signing.send_taken_over';

export function isSendTakenOverFor(
  n: { type: string; linkUrl?: string },
  rfpCode: string,
): boolean {
  if (n.type !== SEND_TAKEN_OVER_TYPE || !n.linkUrl) return false;
  // 상대 경로라 base 가 필요하다(값은 쓰지 않는다). 파싱 실패는 매칭 실패로 본다.
  let path: string;
  try {
    path = new URL(n.linkUrl, 'http://x').pathname;
  } catch {
    return false;
  }
  return path.split('/').pop() === rfpCode;
}
