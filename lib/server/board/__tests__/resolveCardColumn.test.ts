import { describe, expect, it } from 'vitest';
import { resolveCardColumn } from '@/lib/server/board/resolveCardColumn';
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

describe('resolveCardColumn', () => {
  const sent = col({ id: 'c-sent', lifecycleKey: 'sent' });
  const collecting = col({ id: 'c-collecting', lifecycleKey: 'collecting' });
  const custom = col({ id: 'c-custom', lifecycleKey: null });
  const columns = [sent, collecting, custom];

  it('explicit board_column_id wins over the lifecycle key', () => {
    expect(
      resolveCardColumn({ boardColumnId: custom.id, lifecycleKey: 'sent', columns }),
    ).toBe(custom.id);
  });

  it('falls back to the lifecycle-matching column when no board_column_id', () => {
    expect(
      resolveCardColumn({ boardColumnId: null, lifecycleKey: 'collecting', columns }),
    ).toBe(collecting.id);
  });

  it('ignores a stale board_column_id (column gone), using the lifecycle key', () => {
    expect(
      resolveCardColumn({ boardColumnId: 'gone', lifecycleKey: 'sent', columns }),
    ).toBe(sent.id);
  });

});
