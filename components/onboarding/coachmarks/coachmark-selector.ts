// data-coachmark 앵커 셀렉터의 단일 출처 — CSS.escape로 특수문자 target이
// querySelector SyntaxError를 내지 않게 한다 (Tour 클릭 매칭·useAnchorRect 공용).
export function coachmarkSelector(target: string): string {
  return `[data-coachmark="${CSS.escape(target)}"]`;
}
