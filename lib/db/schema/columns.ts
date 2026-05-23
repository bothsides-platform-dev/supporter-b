import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { columnKindEnum, chipColorEnum } from './_enums';
import { workspaces } from './workspaces';

// Unified kanban column. The board is keyed by (workspace_id, kind) — there is
// no `boards` table. A column is one of:
//   - lifecycle-bound (lifecycle_key != null): cards classify into it; non-
//     deletable. Includes the rfp_bids default-landing "진행전" (key='inbox').
//   - custom          (lifecycle_key = null): user-created, freely deletable;
//     a card sits here via card.board_column_id.
// "system" (non-deletable) is derived: lifecycle_key IS NOT NULL — no stored
// is_system flag. See isSystemColumn() in lib/types/column.ts.
export const columns = pgTable(
  'columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: columnKindEnum('kind').notNull(),
    title: text('title').notNull(),
    // Fractional index (string) so reorders never re-number siblings.
    position: text('position').notNull(),
    color: chipColorEnum('color'),
    // Bound lifecycle state/action; null = custom column.
    lifecycleKey: text('lifecycle_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    // One lifecycle column per (workspace, kind); custom columns (null key) are
    // unbounded — the partial predicate lives in the hand-written migration SQL.
    uniqueIndex('columns_ws_kind_lifecycle_uniq')
      .on(t.workspaceId, t.kind, t.lifecycleKey)
      .where(sql`${t.lifecycleKey} IS NOT NULL`),
    index('columns_ws_kind_idx').on(t.workspaceId, t.kind),
  ],
);
