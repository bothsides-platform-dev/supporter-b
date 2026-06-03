import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pgRequestStatusEnum } from './_enums';
import { rfps } from './rfps';
import { workspaces } from './workspaces';
import { users } from './users';

// 비초대 PG가 오픈 게시판에서 보낸 참여 요청(콜드 피치). `rfp_invitations` 와 분리한
// 이유: rfp_invitations 는 (rfp_id, pg_ws_id) UNIQUE 라서, 요청이 수락돼 실제
// invitation 으로 전환될 때 충돌한다. 또 여기엔 피치 메시지·거절 상태를 담는다.
// 쌍당 1요청(UNIQUE) — 거절은 영구, 재요청 경로 없음.
export const rfpPgRequests = pgTable(
  'rfp_pg_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // PG가 작성한 콜드 피치 본문.
    message: text('message').notNull().default(''),
    status: pgRequestStatusEnum('status').notNull().default('pending'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    // 수락/거절을 결정한 구매사 사용자. ON DELETE SET NULL.
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    // 같은 RFP에 같은 PG가 두 번 요청하지 못하도록 차단. 게시판 제외 판정의 근거.
    uniqueIndex('rfp_pg_requests_rfp_ws_uniq').on(t.rfpId, t.pgWsId),
    // 구매사 검토 목록(rfp_id) 은 위 UQ 의 leftmost-prefix 가 커버.
    index('rfp_pg_requests_pg_ws_status_idx').on(t.pgWsId, t.status),
  ],
);
