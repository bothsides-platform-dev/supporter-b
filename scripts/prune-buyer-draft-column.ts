/**
 * scripts/prune-buyer-draft-column.ts — one-shot, idempotent.
 *
 * Removes the buyer pipeline '작성중'(lifecycle_key='draft') column from existing
 * workspaces. The column was retired from the seed; new workspaces never get it.
 * rfps.board_column_id is ON DELETE SET NULL, so any RFP explicitly filed into
 * this column safely falls back to auto-classification (and draft-status RFPs are
 * hidden from the board regardless). Re-running is safe. Run via
 * `tsx scripts/prune-buyer-draft-column.ts`.
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { columns } from '@/lib/db/schema';

async function main(): Promise<void> {
  const deleted = await db
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), eq(columns.lifecycleKey, 'draft')))
    .returning({ id: columns.id });

  console.log(
    `prune-buyer-draft-column: removed ${deleted.length} '작성중'(draft) pipeline column(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
