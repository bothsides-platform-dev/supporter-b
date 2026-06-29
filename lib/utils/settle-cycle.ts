// 정산주기/배송주기의 정본(canonical) 형식. 단위 D/W/M + "+" + 1~999 (선행 0·D+0 불가).
// 견적 제출·템플릿 저장의 권위적 검증 출처(submitBidAction·saveQuoteTemplateAction 공유).
// 위저드 클라이언트 게이트(isCycleValid)는 N≥1만 보장하고 상한은 두지 않으므로
// (DayOffsetInput에 max 없음), 1000 이상 같은 비정상 값은 이 RE가 서버에서 거부한다(fail-closed).
export const SETTLE_CYCLE_RE = /^[DWM]\+[1-9]\d{0,2}$/;

// "D+N" 문자열을 { 단위, 숫자 }로 분해하는 파서 정규식(캡처 그룹 보유). 검증용
// SETTLE_CYCLE_RE 와 달리 의도적으로 느슨하다(레거시·중간 입력값도 분해). 단위 집합
// [DWM] 을 단일 출처로 공유해, 단위가 늘면 모든 파서 호출처가 함께 갱신된다.
export const SETTLE_CYCLE_PARSE_RE = /^([DWM])\+(\d+)$/;

const TYPE_ORDER: Record<string, number> = { D: 0, W: 1, M: 2 };

function parse(cycle: string): { type: string; n: number } {
  const [type, num] = cycle.split('+');
  return { type, n: parseInt(num, 10) };
}

export function compareSettleCycle(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  const typeA = TYPE_ORDER[pa.type] ?? 99;
  const typeB = TYPE_ORDER[pb.type] ?? 99;
  if (typeA !== typeB) return typeA - typeB;
  return pa.n - pb.n;
}

export function formatSettleCycle(type: 'D' | 'W' | 'M', n: number): string {
  return `${type}+${n}`;
}
