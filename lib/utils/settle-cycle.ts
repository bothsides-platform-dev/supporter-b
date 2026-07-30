// 정산주기/배송주기의 정본(canonical) 형식. 단위 D/W/M + "+" + 양의 정수(선행 0·D+0 불가, 상한 없음).
// 견적 제출·템플릿 저장의 권위적 검증 출처(submitBidAction·saveQuoteTemplateAction 공유).
// 위저드 클라이언트 게이트(isCycleValid)와 동일하게 "양의 정수"만 요구한다 — 상한을 두지 않아
// (DayOffsetInput에 max 없음) 클라이언트가 통과시킨 값은 서버에서도 통과한다(불일치 없음).
export const SETTLE_CYCLE_RE = /^[DWM]\+[1-9]\d*$/;

// 월 정산한도의 하한(배타적) — 이 값을 **초과**해야 유효하다. SETTLE_CYCLE_RE 와
// 같은 이유로 여기 산다: 견적 제출(submitBidAction)·템플릿 저장
// (saveQuoteTemplateAction)·위저드 클라이언트 게이트(isSettleLimitValid) 셋이
// 같은 판정을 해야 하는데, 규칙을 각자 적어 두면 조용히 갈린다.
//
// 0 을 막는 이유: 0 은 '한도 없음'이 아니라 '한도 0원'으로 읽히고, 구매사 비교
// 패널이 저장값을 그대로 찍는다. 컬럼이 NOT NULL DEFAULT '0' 이라 미입력과 진짜
// 0 이 저장 시점에 구분되지 않으므로 입력을 막는 것이 유일한 구분 지점이다.
export const SETTLE_LIMIT_MIN = 0;

/** 정산한도 금액이 유효한가(= SETTLE_LIMIT_MIN 초과). 클라·서버 공용 판정. */
export function isSettleLimitAmountValid(amount: number): boolean {
  return Number.isFinite(amount) && amount > SETTLE_LIMIT_MIN;
}

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
