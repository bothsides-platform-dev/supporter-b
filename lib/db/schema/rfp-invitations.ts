import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { invitationStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';
import { columns } from './columns';

export const rfpInvitations = pgTable(
  'rfp_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    tokenHash: text('token_hash').notNull().unique(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().default(sql`now()`),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: invitationStatusEnum('status').notNull().default('pending'),
    // Unified kanban (pg pipeline board): explicit placement into a custom
    // column. null ⇒ classifier-derived. ON DELETE SET NULL ⇒ auto-fallback.
    boardColumnId: uuid('board_column_id').references(() => columns.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    // 같은 RFP에 같은 PG 워크스페이스를 두 번 추가하지 못하도록 차단.
    // (rfp_id) 조회는 이 UQ 의 leftmost-prefix 가 커버.
    uniqueIndex('rfp_invitations_rfp_ws_uniq').on(t.rfpId, t.pgWsId),
    // P2: PG 칸반 findByPgWorkspace (pg_ws_id + status IN [...]).
    index('rfp_invitations_pg_ws_status_idx').on(t.pgWsId, t.status),
    index('rfp_invitations_board_column_idx').on(t.boardColumnId),
  ],
);
