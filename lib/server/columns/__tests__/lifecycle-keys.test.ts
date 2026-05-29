import { describe, expect, it } from 'vitest';
import {
  CROSS_SIDE_LIFECYCLE_KEYS,
  isCrossSideLifecycleKey,
} from '@/lib/server/columns/lifecycle-keys';
import { BUYER_KANBAN_ORDER } from '@/lib/server/buyer-kanban';
import { PG_KANBAN_ORDER } from '@/lib/server/pg-kanban';

describe('cross-side lifecycle keys', () => {
  it('locks exactly the buyer↔PG protocol stages', () => {
    expect([...CROSS_SIDE_LIFECYCLE_KEYS].sort()).toEqual(
      [
        // buyer side
        'active',
        'awarded',
        'closed',
        // pg side
        'received',
        'submitted',
        'won',
        'lost',
      ].sort(),
    );
  });

  it('every cross-side key is a real lifecycle stage (no typos drift)', () => {
    const all = new Set<string>([...BUYER_KANBAN_ORDER, ...PG_KANBAN_ORDER]);
    for (const k of CROSS_SIDE_LIFECYCLE_KEYS) {
      expect(all.has(k)).toBe(true);
    }
  });

  it('removed stages are NOT cross-side (가드)', () => {
    expect(isCrossSideLifecycleKey('draft')).toBe(false); // 제거된 단계 (작성중 — buyer)
    expect(isCrossSideLifecycleKey('drafting')).toBe(false); // 제거된 단계 (작성중 — pg)
    expect(isCrossSideLifecycleKey('reviewing')).toBe(false); // 제거된 단계 — cross-side 에 추가되지 않도록 가드
    expect(isCrossSideLifecycleKey('active')).toBe(true);
    expect(isCrossSideLifecycleKey(null)).toBe(false); // custom / default-landing
  });
});
