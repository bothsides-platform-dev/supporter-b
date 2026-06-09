/**
 * 오픈 리다이렉트 방지용 내부 경로 검증기.
 *
 * 반환값: 안전한 내부 경로면 그대로 반환, 그 외 null.
 *
 * 통과 규칙:
 *   - 단일 '/'로 시작
 *   - 두 번째 문자가 '/'·'\' 아님 (프로토콜-상대 URL, UNC 경로 차단)
 *   - 첫 '/' 이전에 ':' 없음 (스킴 차단: javascript:, http:, …)
 *   - 제어 문자(\x00–\x1f) 없음
 *
 * 엣지 세이프 — 외부 임포트 없음.
 */
export function safeInternalNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (next[0] !== '/') return null;
  const second = next[1];
  if (second === '/' || second === '\\') return null;
  if (/[\x00-\x1f]/.test(next)) return null;
  return next;
}
