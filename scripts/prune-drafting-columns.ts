/**
 * scripts/prune-drafting-columns.ts — one-shot, idempotent.
 *
 * Removes the retired '작성중' pipeline columns from existing workspaces:
 *   - buyer: lifecycle_key='draft'    (발송 전 RFP — 칸반에서 숨김, 표 뷰에만 노출)
 *   - pg:    lifecycle_key='drafting' (제출 전 입찰서 — 신규 컬럼으로 흡수)
 * Both were retired from the seed; new workspaces never get them.
 * {rfps,bids,rfp_invitations}.board_column_id is ON DELETE SET NULL, so any card
 * explicitly filed into these columns safely falls back to auto-classification.
 * Re-running is safe. Run via `tsx scripts/prune-drafting-columns.ts`.
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { columns } from '@/lib/db/schema';

async function main(): Promise<void> {
  const deleted = await db
    .delete(columns)
    .where(and(eq(columns.kind, 'pipeline'), inArray(columns.lifecycleKey, ['draft', 'drafting'])))
    .returning({ id: columns.id, lifecycleKey: columns.lifecycleKey });

  const buyer = deleted.filter((c) => c.lifecycleKey === 'draft').length;
  const pg = deleted.filter((c) => c.lifecycleKey === 'drafting').length;
  console.log(
    `prune-drafting-columns: removed ${deleted.length} 작성중 column(s) (buyer draft: ${buyer}, pg drafting: ${pg}).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
