/**
 * 마감일(deadline) 관련 순수 유틸리티.
 *
 * 레거시 저장 규약:
 *   `endOfDayKstIso`는 기존 견적의 KST 끝 — `YYYY-MM-DDT23:59:59+09:00`
 *   (= `YYYY-MM-DDT14:59:59Z`) — 을 표현하는 호환 헬퍼다.
 *   새 맞춤 PG 상담의 한국 영업일 마감은 `businessDeadline`에서 해당일
 *   18:00 KST로 계산한다. 이 파일의 함수 동작은 변경하지 않는다.
 *
 * 레거시:
 *   과거 데이터는 `YYYY-MM-DDT23:59:59Z` 형식으로 저장되어 있다.
 *   이 인스턴트는 KST로 다음날 08:59:59 이므로 실제 마감이 9시간 늦다.
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
  // 'en-CA' locale produces ISO-format 'YYYY-MM-DD' — the only purpose of this locale choice.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}
