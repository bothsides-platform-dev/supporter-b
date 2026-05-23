import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { columns } from './columns';
import { rfps } from './rfps';

// Explicit placement of an RFP card (buyer pipeline board) into a custom column.
// Sparse: only cards the user manually filed have a row; the rest classify into
// their lifecycle column at read time. One placement per card (rfp_id unique).
export const rfpPlacements = pgTable(
  'rfp_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    columnId: uuid('column_id')
      .notNull()
      .references(() => columns.id, { onDelete: 'cascade' }),
    rfpId: uuid('rfp_id')
      .notNull()
      .unique()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    position: text('position').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('rfp_placements_column_idx').on(t.columnId)],
);
