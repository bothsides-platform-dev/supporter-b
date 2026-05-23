import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { columnKindEnum, chipColorEnum } from './_enums';
import { workspaces } from './workspaces';

// Unified kanban column. The board is keyed by (workspace_id, kind) — there is
// no `boards` table. A column is either:
//   - lifecycle-bound (lifecycle_key != null): cards classify into it; never
//     holds placement rows; is_system = true (non-deletable skeleton).
//   - default landing  (lifecycle_key = null, is_system = true): the rfp_bids
//     "진행전" fallback for unplaced bids.
//   - custom           (lifecycle_key = null, is_system = false): user-created,
//     holds explicit placement rows, freely deletable.
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
    // Bound lifecycle state/action; null = custom or default-landing column.
    lifecycleKey: text('lifecycle_key'),
    // true = non-deletable (cross-side protocol / lifecycle skeleton / default).
    isSystem: boolean('is_system').notNull().default(false),
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
