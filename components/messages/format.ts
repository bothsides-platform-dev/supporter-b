// 메시지 스레드 공용 포맷터 — ThreadView(상대방 채팅)·TeamThreadView(팀 채팅)가
// 동일한 날짜 구분선·타임스탬프 표기를 쓰도록 단일 출처로 둔다.

/** 날짜 구분선 라벨 — "6월 10일 수요일" (ko-KR, 로컬 TZ). */
export function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

/** 말풍선 타임스탬프 — "오후 7:03" (ko-KR, 로컬 TZ). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 같은 발신자의 연속 메시지를 한 묶음으로 보는 최대 간격(이내면 헤더 생략). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * 그룹핑 시간 판정 — 직전 메시지와의 간격이 윈도 이내인지(경계 포함).
 * 발신자 비교는 뷰마다 키가 달라(워크스페이스 vs 유저) 호출부 책임.
 */
export function withinGroupWindow(prevIso: string, currIso: string): boolean {
  return Date.parse(currIso) - Date.parse(prevIso) <= GROUP_WINDOW_MS;
}
