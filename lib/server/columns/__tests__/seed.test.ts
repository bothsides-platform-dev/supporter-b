import { describe, expect, it } from 'vitest';
import { defaultColumns } from '@/lib/server/columns/seed';
import { BUYER_KANBAN_ORDER } from '@/lib/server/buyer-kanban';
import { PG_KANBAN_ORDER } from '@/lib/server/pg-kanban';
import type { BoardColumn } from '@/lib/types/column';

const WS = '00000000-0000-0000-0000-000000000001';

function positionsStrictlyIncreasing(cols: BoardColumn[]): boolean {
  const ps = cols.map((c) => c.position);
  const sorted = [...ps].sort();
  return JSON.stringify(ps) === JSON.stringify(sorted) && new Set(ps).size === ps.length;
}

describe('defaultColumns', () => {
  it('buyer: pipeline-only (lifecycle columns matching BUYER_KANBAN_ORDER)', () => {
    const cols = defaultColumns(WS, 'buyer');
    expect(cols.every((c) => c.kind === 'pipeline')).toBe(true);
    expect(cols.map((c) => c.lifecycleKey)).toEqual([...BUYER_KANBAN_ORDER]);
    expect(cols.every((c) => c.lifecycleKey !== null)).toBe(true);
  });

  it('pg: 4 pipeline lifecycle columns', () => {
    const cols = defaultColumns(WS, 'pg');
    expect(cols.every((c) => c.kind === 'pipeline')).toBe(true);
    expect(cols.map((c) => c.lifecycleKey)).toEqual([...PG_KANBAN_ORDER]);
    expect(cols.every((c) => c.lifecycleKey !== null)).toBe(true);
  });

  it('positions are unique and ordered; workspaceId stamped', () => {
    const cols = defaultColumns(WS, 'buyer');
    expect(cols.every((c) => c.workspaceId === WS)).toBe(true);
    expect(positionsStrictlyIncreasing(cols.filter((c) => c.kind === 'pipeline'))).toBe(true);
  });
});
