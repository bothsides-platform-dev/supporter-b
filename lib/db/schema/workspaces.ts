import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
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
    hasLogo: boolean('has_logo').notNull().default(false),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Marks pre-seeded canonical PG company workspaces (e.g. 'tosspayments', 'kginicis').
    // NULL on all user-created workspaces. Used to populate the PG signup company-selector
    // and to validate joinCanonicalPgWorkspaceAction inputs.
    canonicalPgKey: text('canonical_pg_key').unique(),
    // 가공의 데모 PG(샘플 견적의 비더) 표식. true면 실제 PG 발견 표면에서 제외.
    isDemo: boolean('is_demo').notNull().default(false),
    // 이 구매사 워크스페이스에 온보딩 샘플을 심은 시각. 시드 멱등성 + 삭제 영속성의 근거.
    sampleSeededAt: timestamp('sample_seeded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    index('workspaces_biz_profile_idx').on(t.bizProfileId),
    // 마스터 스위처의 listAllWorkspacesForMaster (WHERE status='active') 가속.
    index('workspaces_status_idx').on(t.status),
  ],
);
