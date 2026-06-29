/**
 * scripts/remove-awarded-kanban-columns.ts — one-shot, idempotent.
 *
 * Removes the buyer pipeline '선정 완료' columns (lifecycle_key='awarded') that
 * were seeded into existing workspaces before 선정완료·마감 단계가 '마감' 하나로
 * 병합됐다. New workspaces never get it (removed from BUYER_KANBAN_ORDER); this
 * covers the ones that predate the change. Run via
 * `tsx scripts/remove-awarded-kanban-columns.ts`.
 *
 * Card placements re-home automatically: the cards' board_column_id FK is
 * ON DELETE SET NULL, so deleting the column nulls the pointer and
 * resolveCardColumn re-derives the column from the card's lifecycle stage
 * (awarded RFP → 'closed' 마감 컬럼).
 *
 * Re-running is safe: once the column is gone there is nothing to delete.
 */
import 'dotenv/config';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { columns } from '@/lib/db/schema';

async function main(): Promise<void> {
  const deleted = await db
    .delete(columns)
    .where(and(eq(columns.lifecycleKey, 'awarded'), eq(columns.kind, 'pipeline')))
    .returning({ id: columns.id });

  if (deleted.length === 0) {
    console.log('remove-awarded-kanban-columns: nothing to do (no awarded columns).');
    return;
  }
  console.log(`remove-awarded-kanban-columns: removed ${deleted.length} 선정 완료 columns.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
