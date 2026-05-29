import { describe, expect, it } from 'vitest';
import { resolveBoardDrop } from '../resolveBoardDrop';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
import type { BoardColumn } from '@/lib/types/column';

function col(over: Partial<BoardColumn> & { id: string }): BoardColumn {
  return {
    workspaceId: 'ws',
    kind: 'pipeline',
    title: 't',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    ...over,
  };
}

describe('resolveBoardDrop', () => {
  it('custom column → place', () => {
    const target = col({ id: 'custom', lifecycleKey: null });
    expect(resolveBoardDrop({ cardType: 'rfp', toColumn: target, payload: { stage: 'active' } })).toEqual({
      kind: 'place',
    });
  });

  it('default-landing column → release', () => {
    const target = col({ id: 'landing', kind: 'rfp_bids', lifecycleKey: DEFAULT_LANDING_KEY });
    expect(resolveBoardDrop({ cardType: 'bid', toColumn: target, payload: {} })).toEqual({
      kind: 'release',
    });
  });

  it('rfp awarded → closed (no valid transition) → reject', () => {
    const target = col({ id: 'closed', lifecycleKey: 'closed' });
    expect(
      resolveBoardDrop({
        cardType: 'rfp',
        toColumn: target,
        payload: { stage: 'awarded', rfpId: 'P-2605-0001', title: 'RFP' },
      }),
    ).toEqual({ kind: 'reject' });
  });

  it('rfp active → closed lifecycle column → cancel-rfp action', () => {
    const target = col({ id: 'closed', lifecycleKey: 'closed' });
    expect(
      resolveBoardDrop({
        cardType: 'rfp',
        toColumn: target,
        payload: { stage: 'active', rfpId: 'P-2605-0009', title: 'RFP9' },
      }),
    ).toEqual({ kind: 'lifecycle', action: { kind: 'cancel-rfp', rfpId: 'P-2605-0009', title: 'RFP9' } });
  });

  it('invitation submitted → lost lifecycle column → withdraw-bid action', () => {
    const target = col({ id: 'lost', lifecycleKey: 'lost' });
    expect(
      resolveBoardDrop({
        cardType: 'invitation',
        toColumn: target,
        payload: { stage: 'submitted', rfpId: 'P-2605-0002', title: 'inv', bidId: 'bid-1' },
      }),
    ).toEqual({
      kind: 'lifecycle',
      action: { kind: 'withdraw-bid', bidId: 'bid-1', rfpId: 'P-2605-0002', title: 'inv' },
    });
  });

  it('bid into a custom column → place; into 진행전 → release', () => {
    const custom = col({ id: 'nego', kind: 'rfp_bids', lifecycleKey: null });
    const landing = col({ id: 'landing', kind: 'rfp_bids', lifecycleKey: DEFAULT_LANDING_KEY });
    expect(resolveBoardDrop({ cardType: 'bid', toColumn: custom, payload: {} }).kind).toBe('place');
    expect(resolveBoardDrop({ cardType: 'bid', toColumn: landing, payload: {} }).kind).toBe('release');
  });
});
