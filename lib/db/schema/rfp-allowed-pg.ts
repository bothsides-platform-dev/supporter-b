import { pgTable, uuid, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rfps } from './rfps';
import { workspaces } from './workspaces';

// RFP allowlist (C2) — normalized replacement for the old
// `rfps.allowed_pg_workspace_ids uuid[]`. One row per (RFP, allowed PG
// workspace). FK integrity on both sides; `(pg_ws_id)` index serves the
// reverse lookup "which RFPs allow workspace X". Allowlist is distinct from
// `rfp_invitations` (which records actually-sent invites).
export const rfpAllowedPg = pgTable(
  'rfp_allowed_pg',
  {
    rfpId: uuid('rfp_id')
      .notNull()
      .references(() => rfps.id, { onDelete: 'cascade' }),
    pgWsId: uuid('pg_ws_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.rfpId, t.pgWsId] }),
    index('rfp_allowed_pg_ws_idx').on(t.pgWsId),
  ],
);
