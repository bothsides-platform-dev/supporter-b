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

/**
 * 말풍선 타임스탬프 — "오후 7:03" (로컬 TZ).
 * toLocaleTimeString('ko-KR') 대신 직접 조립한다: small-ICU 노드(일부 SSR 런타임·
 * CI)에서는 ko 의 오전/오후 심볼이 라틴 "AM/PM" 으로 폴백돼 한국어 사용자에게
 * 영문 시각이 노출되기 때문. 시/분 getter 는 ICU 데이터에 의존하지 않는다.
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h24 = d.getHours();
  const minute = String(d.getMinutes()).padStart(2, '0');
  const period = h24 < 12 ? '오전' : '오후';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${period} ${h12}:${minute}`;
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

/**
 * 대화 목록 타임스탬프 — 오늘=시각, 어제="어제", 7일 이내=요일명, 그 이전=M/D.
 * @param now — 테스트 주입용 기준 시각 (기본값: 현재)
 */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const todayUtcMid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dUtcMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((todayUtcMid - dUtcMid) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return formatTime(iso);
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return d.toLocaleDateString('ko-KR', { weekday: 'long' });
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
