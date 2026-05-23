// Pure resolution of a kanban drop → what should happen. Keeps the drag logic
// testable without simulating dnd-kit. Reuses the existing dragMatrix for the
// lifecycle-column → domain-action mapping (send/cancel/withdraw/navigate).
import { resolveDrag, type DragAction } from '@/components/home/dragMatrix';
import { DEFAULT_LANDING_KEY } from '@/lib/server/columns/lifecycle-keys';
import type { BoardColumn, CardType } from '@/lib/types/column';
import type { BuyerKanbanStage } from '@/lib/server/buyer-kanban';
import type { PgKanbanStage } from '@/lib/server/pg-kanban';

export type BoardDrop =
  | { kind: 'place' } // custom column → moveCardAction (placement)
  | { kind: 'release' } // default-landing column → releaseCardAction
  | { kind: 'lifecycle'; action: DragAction } // action-bound lifecycle → dialog/route
  | { kind: 'reject' }; // derived-only lifecycle / invalid transition → snap back

// payload is the card display object (BuyerKanbanCard | PgKanbanCard | Bid);
// only the pipeline variants carry the fields the lifecycle branch reads.
type CardPayload = {
  stage?: string;
  rfpId?: string;
  title?: string;
  bidId?: string;
};

export function resolveBoardDrop(args: {
  cardType: CardType;
  toColumn: BoardColumn;
  payload: CardPayload;
}): BoardDrop {
  const { cardType, toColumn, payload } = args;

  // Custom columns are the only placement targets.
  if (!toColumn.isSystem) return { kind: 'place' };

  // Default-landing column → strip the placement (back to auto-classification).
  if (toColumn.lifecycleKey === DEFAULT_LANDING_KEY) return { kind: 'release' };

  // Lifecycle column → map to a domain action (pipeline boards only).
  if (cardType === 'rfp') {
    const action = resolveDrag({
      role: 'buyer',
      from: payload.stage as BuyerKanbanStage,
      to: toColumn.lifecycleKey as BuyerKanbanStage,
      rfpId: payload.rfpId ?? '',
      title: payload.title ?? '',
    });
    return action ? { kind: 'lifecycle', action } : { kind: 'reject' };
  }
  if (cardType === 'invitation') {
    const action = resolveDrag({
      role: 'pg',
      from: payload.stage as PgKanbanStage,
      to: toColumn.lifecycleKey as PgKanbanStage,
      rfpId: payload.rfpId ?? '',
      title: payload.title ?? '',
      bidId: payload.bidId,
    });
    return action ? { kind: 'lifecycle', action } : { kind: 'reject' };
  }

  // bid: rfp_bids has no action-bound lifecycle columns.
  return { kind: 'reject' };
}
