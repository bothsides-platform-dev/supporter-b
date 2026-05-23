import { type BoardColumn, isSystemColumn } from '@/lib/types/column';

// Resolve which column a card belongs in (sparse-override):
//   1. explicit board_column_id (the user filed it into a custom column)
//   2. the column bound to the card's lifecycle key — auto-classified
//   3. defensive fallback: a system (lifecycle-bound) column, else the first
//
// FK ON DELETE SET NULL guarantees board_column_id only ever points at a live
// column (deleting a custom column nulls it), so no "does it still exist" check
// is needed beyond a defensive membership test.
export function resolveCardColumn(args: {
  boardColumnId: string | null | undefined;
  lifecycleKey: string | null;
  columns: BoardColumn[];
}): string {
  const { boardColumnId, lifecycleKey, columns } = args;

  if (boardColumnId) {
    const placed = columns.find((c) => c.id === boardColumnId);
    if (placed) return placed.id;
  }

  if (lifecycleKey != null) {
    const byKey = columns.find((c) => c.lifecycleKey === lifecycleKey);
    if (byKey) return byKey.id;
  }

  const system = columns.find(isSystemColumn);
  if (system) return system.id;
  if (columns.length > 0) return columns[0].id;
  throw new Error('resolveCardColumn: board has no columns');
}
