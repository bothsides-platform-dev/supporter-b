import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { columns } from './columns';
import { rfpInvitations } from './rfp-invitations';

// Explicit placement of an invitation card (PG pipeline board) into a custom
// column. Sparse, one placement per card (invitation_id unique). See rfp-placements.
export const invitationPlacements = pgTable(
  'invitation_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    columnId: uuid('column_id')
      .notNull()
      .references(() => columns.id, { onDelete: 'cascade' }),
    invitationId: uuid('invitation_id')
      .notNull()
      .unique()
      .references(() => rfpInvitations.id, { onDelete: 'cascade' }),
    position: text('position').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [index('invitation_placements_column_idx').on(t.columnId)],
);
