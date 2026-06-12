// Pre-evaluates every column as a drop target for the dragged card so the
// board can dim invalid columns while the drag is in flight. resolveBoardDrop
// is pure, so running it per-column on dragStart is safe and cheap.
// The returned set means "do NOT dim": valid targets + the origin column.
import { resolveBoardDrop } from './resolveBoardDrop';
import type { BoardCard, BoardColumn, CardType } from '@/lib/types/column';

export function computeValidDropTargets(args: {
  card: BoardCard;
  columns: BoardColumn[];
  cardType: CardType;
  currentColumnId: string;
}): Set<string> {
  const { card, columns, cardType, currentColumnId } = args;
  const out = new Set<string>();
  for (const column of columns) {
    if (column.id === currentColumnId) {
      out.add(column.id);
      continue;
    }
    const drop = resolveBoardDrop({
      cardType,
      toColumn: column,
      payload: card.payload as object,
    });
    if (drop.kind !== 'reject') out.add(column.id);
  }
  return out;
}
