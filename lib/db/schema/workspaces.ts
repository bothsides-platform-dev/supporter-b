import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaceTypeEnum, workspaceStatusEnum } from './_enums';
import { bizProfiles } from './biz-profiles';

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: workspaceTypeEnum('type').notNull(),
    name: text('name').notNull(),
    bizProfileId: uuid('biz_profile_id').references(() => bizProfiles.id, {
      onDelete: 'set null',
    }),
    status: workspaceStatusEnum('status').notNull().default('pending'),
    statusReason: text('status_reason'),
    // 로고 버전/존재 겸용(avatar_updated_at 패턴). NULL=로고 없음,
    // non-NULL=있음 + <img> ?v 캐시 버스트 키. 바이트는 workspace_logo_blobs.
    logoUpdatedAt: timestamp('logo_updated_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Marks pre-seeded canonical PG company workspaces (e.g. 'tosspayments', 'kginicis').
    // NULL on all user-created workspaces. Used to populate the PG signup company-selector
    // and to validate joinCanonicalPgWorkspaceAction inputs.
    canonicalPgKey: text('canonical_pg_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('workspaces_biz_profile_idx').on(t.bizProfileId),
    // 마스터 스위처의 listAllWorkspacesForMaster (WHERE status='active') 가속.
    index('workspaces_status_idx').on(t.status),
  ],
);
