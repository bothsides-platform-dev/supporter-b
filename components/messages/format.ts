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
