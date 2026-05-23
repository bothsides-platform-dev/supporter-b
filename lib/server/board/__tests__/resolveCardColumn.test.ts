import { describe, expect, it } from 'vitest';
import { resolveCardColumn } from '@/lib/server/board/resolveCardColumn';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
import type { BoardColumn, Placement } from '@/lib/types/column';

function col(over: Partial<BoardColumn> & { id: string }): BoardColumn {
  return {
    workspaceId: 'ws',
    kind: 'pipeline',
    title: 't',
    position: 'a1',
    color: null,
    lifecycleKey: null,
    isSystem: false,
    ...over,
  };
}

describe('resolveCardColumn', () => {
  const sent = col({ id: 'c-sent', lifecycleKey: 'sent', isSystem: true });
  const collecting = col({ id: 'c-collecting', lifecycleKey: 'collecting', isSystem: true });
  const custom = col({ id: 'c-custom', lifecycleKey: null, isSystem: false });
  const columns = [sent, collecting, custom];

  it('explicit placement wins over the lifecycle key', () => {
    const placement: Placement = { columnId: custom.id, cardId: 'x', position: 'a1' };
    expect(resolveCardColumn({ lifecycleKey: 'sent', placement, columns })).toBe(custom.id);
  });

  it('falls back to the lifecycle-matching column when no placement', () => {
    expect(
      resolveCardColumn({ lifecycleKey: 'collecting', placement: undefined, columns }),
    ).toBe(collecting.id);
  });

  it('ignores a placement whose column no longer exists, using the lifecycle key', () => {
    const stale: Placement = { columnId: 'gone', cardId: 'x', position: 'a1' };
    expect(resolveCardColumn({ lifecycleKey: 'sent', placement: stale, columns })).toBe(sent.id);
  });

  it('rfp_bids: the default-landing key resolves to 진행전', () => {
    const landing = col({
      id: 'c-landing',
      kind: 'rfp_bids',
      lifecycleKey: DEFAULT_LANDING_KEY,
      isSystem: true,
      title: '진행전',
    });
    const nego = col({ id: 'c-nego', kind: 'rfp_bids', title: '협상중' });
    expect(
      resolveCardColumn({
        lifecycleKey: DEFAULT_LANDING_KEY,
        placement: undefined,
        columns: [landing, nego],
      }),
    ).toBe(landing.id);
  });
});
