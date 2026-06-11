import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfpRequoteRequestStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

/**
 * 견적 재요청(마감 전 협상 라운드). 구매사가 특정 PG에게 "조건을 개선해 다시 내달라"고
 * 요청한 1건. (rfp, pg, round) UNIQUE — 라운드별 1요청, 중복 pending 차단.
 */
export const rfpRequoteRequests = pgTable(
  'rfp_requote_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    message: text('message').notNull(),
    deadline: timestamp('deadline', { withTimezone: true }).notNull(),
    status: rfpRequoteRequestStatusEnum('status').notNull().default('pending'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('rfp_requote_requests_rfp_ws_round_uniq').on(t.rfpId, t.pgWsId, t.round),
    index('rfp_requote_requests_pg_ws_status_idx').on(t.pgWsId, t.status),
  ],
);
