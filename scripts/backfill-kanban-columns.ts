/**
 * scripts/backfill-kanban-columns.ts — one-shot, idempotent.
 *
 * Seeds the unified kanban `columns` for any existing workspace that has none
 * (new workspaces get them via createWorkspaceInTx; this covers workspaces that
 * predate the unified-kanban cutover). Run via `tsx scripts/backfill-kanban-columns.ts`.
 *
 * Single source of truth: `defaultColumns` — same data the migration/seed use.
 * Re-running is safe: workspaces that already have columns are skipped.
 */
import 'dotenv/config';

import { db } from '@/lib/db/client';
import { columns, workspaces } from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';

async function main(): Promise<void> {
  const allWs = await db
    .select({ id: workspaces.id, type: workspaces.type })
    .from(workspaces);
  const withCols = await db
    .select({ workspaceId: columns.workspaceId })
    .from(columns);
  const seeded = new Set(withCols.map((c) => c.workspaceId));

  const targets = allWs.filter((w) => !seeded.has(w.id));
  if (targets.length === 0) {
    console.log('backfill-kanban-columns: nothing to do (all workspaces seeded).');
    return;
  }

  const rows = targets.flatMap((w) => defaultColumns(w.id, w.type));
  await db.insert(columns).values(rows);
  console.log(
    `backfill-kanban-columns: seeded ${rows.length} columns across ${targets.length} workspaces.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
