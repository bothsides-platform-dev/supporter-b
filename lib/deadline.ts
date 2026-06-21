/**
 * 마감일(deadline) 관련 순수 유틸리티.
 *
 * 저장 규약:
 *   신규 마감일은 KST 끝 — `YYYY-MM-DDT23:59:59+09:00` 형식으로 저장한다.
 *   이 인스턴트는 `YYYY-MM-DDT14:59:59Z` 와 동일하다.
 *   구매사가 "6월 30일"을 선택하면 실제 마감은 **KST 6월 30일 23:59:59** 이다.
 *
 * 레거시:
 *   과거 데이터는 `YYYY-MM-DDT23:59:59Z` 형식으로 저장되어 있다.
 *   이 인스턴트는 KST로 다음날 08:59:59 이므로 실제 마감이 9시간 늦다.
 *   신규·재요청 마감일은 이 헬퍼를 통해 KST 끝으로 저장하고,
 *   기존 데이터는 마이그레이션 없이 그대로 유지한다.
 */

/** 'YYYY-MM-DD' → 그 날 KST 끝(23:59:59 KST = 14:59:59 UTC)의 ISO 오프셋 문자열. */
export function endOfDayKstIso(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59+09:00`;
}

/**
 * Date 인스턴스 → KST 달력 날짜 'YYYY-MM-DD' 문자열.
 * HTML date input min 속성 계산 등 KST 날짜 참조가 필요한 곳에서 사용.
 */
export function kstDateOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}
