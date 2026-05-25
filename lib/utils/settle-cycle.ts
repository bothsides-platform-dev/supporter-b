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
