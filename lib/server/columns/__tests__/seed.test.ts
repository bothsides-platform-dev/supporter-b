import { describe, expect, it } from 'vitest';
import { defaultColumns } from '@/lib/server/columns/seed';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
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
  it('buyer: 6 pipeline lifecycle columns + 3 rfp_bids columns', () => {
    const cols = defaultColumns(WS, 'buyer');
    const pipeline = cols.filter((c) => c.kind === 'pipeline');
    const rfpBids = cols.filter((c) => c.kind === 'rfp_bids');

    expect(pipeline.map((c) => c.lifecycleKey)).toEqual([...BUYER_KANBAN_ORDER]);
    expect(pipeline.every((c) => c.isSystem)).toBe(true);

    // rfp_bids: 진행전(default-landing, system) + 협상중/결정(custom)
    expect(rfpBids).toHaveLength(3);
    const landing = rfpBids.find((c) => c.isSystem);
    expect(landing?.title).toBe('진행전');
    expect(landing?.lifecycleKey).toBe(DEFAULT_LANDING_KEY);
    expect(rfpBids.filter((c) => !c.isSystem).map((c) => c.title)).toEqual([
      '협상중',
      '결정',
    ]);
    expect(rfpBids.filter((c) => !c.isSystem).every((c) => c.lifecycleKey === null)).toBe(true);
  });

  it('pg: 6 pipeline lifecycle columns, no rfp_bids board', () => {
    const cols = defaultColumns(WS, 'pg');
    expect(cols.every((c) => c.kind === 'pipeline')).toBe(true);
    expect(cols.map((c) => c.lifecycleKey)).toEqual([...PG_KANBAN_ORDER]);
    expect(cols.every((c) => c.isSystem)).toBe(true);
  });

  it('positions are unique and ordered within each kind; workspaceId stamped', () => {
    const cols = defaultColumns(WS, 'buyer');
    expect(cols.every((c) => c.workspaceId === WS)).toBe(true);
    expect(positionsStrictlyIncreasing(cols.filter((c) => c.kind === 'pipeline'))).toBe(true);
    expect(positionsStrictlyIncreasing(cols.filter((c) => c.kind === 'rfp_bids'))).toBe(true);
  });
});
