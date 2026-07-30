/**
 * 서버가 준 에러 코드를 사용자 문구로 바꾼다. 미매핑 코드는 `fallback` 으로 흡수하며
 * **내부 enum 을 절대 그대로 돌려주지 않는다** — 그게 이 함수의 존재 이유다.
 *
 * `map[code] ?? fallback` 을 직접 쓰면 그 보장이 두 축에서 깨진다:
 *   1. `code` 가 프로토타입 체인 키(`constructor`·`toString`·`valueOf`…)면 객체
 *      리터럴 조회가 **함수**를 잡아내고 `??` 는 발동하지 않는다. 그 함수가 toast 로
 *      넘어가 렌더가 깨지거나 내부 값이 샌다.
 *   2. 응답이 우리 형식이 아닐 수 있다(`res.json().catch(() => ({}))`). `code` 가
 *      문자열이 아니면 조회 자체가 의미 없다.
 *
 * 그래서 `hasOwnProperty` 판정 + 문자열 검사를 함께 둔다. 호출처는 세 설정 폼이다
 * (로고·이름·사업자번호) — 판정을 각자 적어 두면 조용히 갈리므로 여기 단일 출처를 둔다.
 */
export function errorLabel(
  map: Record<string, string>,
  code: unknown,
  fallback: string,
): string {
  if (typeof code !== 'string') return fallback;
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : fallback;
}
