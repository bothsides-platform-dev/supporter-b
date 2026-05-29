/**
 * scripts/remove-draft-kanban-columns.ts — one-shot, idempotent.
 *
 * Removes the legacy "작성중" pipeline columns (lifecycle_key in 'draft' /
 * 'drafting') that were seeded into existing workspaces before the 작성중 단계
 * was dropped from the kanban. New workspaces never get them (the stage was
 * removed from BUYER_KANBAN_ORDER / PG_KANBAN_ORDER); this covers the ones that
 * predate the change. Run via `tsx scripts/remove-draft-kanban-columns.ts`.
 *
 * Card placements re-home automatically: the cards' board_column_id FK is
 * ON DELETE SET NULL, so deleting the column nulls the pointer and
 * resolveCardColumn re-derives the column from the card's lifecycle stage.
 * (Buyer draft RFPs are excluded from the board entirely; PG draft bids fold
 * into 신규/received.)
 *
 * Re-running is safe: once the columns are gone there is nothing to delete.
 */
import 'dotenv/config';

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { columns } from '@/lib/db/schema';

const REMOVED_LIFECYCLE_KEYS = ['draft', 'drafting'];

async function main(): Promise<void> {
  const deleted = await db
    .delete(columns)
    .where(inArray(columns.lifecycleKey, REMOVED_LIFECYCLE_KEYS))
    .returning({ id: columns.id });

  if (deleted.length === 0) {
    console.log('remove-draft-kanban-columns: nothing to do (no draft/drafting columns).');
    return;
  }
  console.log(`remove-draft-kanban-columns: removed ${deleted.length} 작성중 columns.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
