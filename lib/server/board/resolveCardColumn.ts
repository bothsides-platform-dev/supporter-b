import type { BoardColumn, Placement } from '@/lib/types/column';

// Resolve which column a card belongs in (sparse-override):
//   1. explicit placement (if its column still exists) — the user filed it
//   2. the column bound to the card's lifecycle key — auto-classified
//   3. defensive fallback: a system column, else the first column
//
// Lifecycle columns are mandatory (non-deletable), so step 2 effectively always
// succeeds for a seeded board; the fallback only guards malformed input.
export function resolveCardColumn(args: {
  lifecycleKey: string | null;
  placement: Placement | undefined;
  columns: BoardColumn[];
}): string {
  const { lifecycleKey, placement, columns } = args;

  if (placement) {
    const placed = columns.find((c) => c.id === placement.columnId);
    if (placed) return placed.id;
  }

  if (lifecycleKey != null) {
    const byKey = columns.find((c) => c.lifecycleKey === lifecycleKey);
    if (byKey) return byKey.id;
  }

  const system = columns.find((c) => c.isSystem);
  if (system) return system.id;
  if (columns.length > 0) return columns[0].id;
  throw new Error('resolveCardColumn: board has no columns');
}
