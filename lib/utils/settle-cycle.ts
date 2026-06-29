// 정산주기/배송주기의 정본(canonical) 형식. 단위 D/W/M + "+" + 1~999 (선행 0·D+0 불가).
// 입력 신뢰 경계(견적 제출·템플릿 저장)의 단일 검증 출처. UI(DayOffsetInput)가 내보내는
// 모든 값은 N≥1·≤99 이므로 이 형식의 부분집합이다.
export const SETTLE_CYCLE_RE = /^[DWM]\+[1-9]\d{0,2}$/;

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
