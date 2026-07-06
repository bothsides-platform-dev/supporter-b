import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarColor: text('avatar_color').notNull().default('#000'),
  // 프로필 사진 버전/유무 겸용 — NULL=사진 없음(이니셜), non-NULL=사진 있음 +
  // 그 타임스탬프를 <img> 캐시 버스트 키(?v)로 사용. 업로드 시 now(), 삭제 시 NULL.
  // 바이트는 user_avatar_blobs(분리 테이블). 비정규화(워크스페이스 logo_updated_at 패턴).
  avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  // Email-verification flag. New signups are created false and flipped true when
  // the user consumes a signup_email token (link or 6-digit code). Read by the
  // /pending-approval verify UI and the (separate-repo) admin console, which
  // only approves verified users. NOT in the JWT/session — read from DB.
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // Server-side JWT revocation counter. Stamped into the token as the `sv`
  // claim at login; bumped on password reset / email change / account deletion
  // so previously issued tokens go stale (see lib/auth/session-version.ts).
  sessionVersion: integer('session_version').notNull().default(1),
  // Remembered active workspace — restored on login so a multi-workspace user
  // lands where they left off. Nullable; set on first ws creation (signup /
  // createWorkspace) and on every switchWorkspaceAction. The FK (ON DELETE SET
  // NULL → workspaces.id) is declared in 0001_multi_workspace.sql, NOT via
  // .references() here — importing `workspaces` would form a users→workspaces→
  // biz_profiles→users type cycle (TS7022). Migrations are hand-written, so the
  // Drizzle-level .references() is unnecessary.
  lastActiveWorkspaceId: uuid('last_active_workspace_id'),
  // System-managed master accounts (pre-seeded PG company admins).
  // Hidden from all member-list UIs; never shown to end users.
  isSystemAccount: boolean('is_system_account').notNull().default(false),
  // 유저 단위 온보딩 상태의 버전드 JSONB 문서 (lib/types/onboarding.ts UserOnboardingV1).
  // rfps.current_terms 패턴과 동일 — 새 온보딩 태스크는 DDL 없이 타입 수정만.
  onboarding: jsonb('onboarding').notNull().default(sql`'{}'::jsonb`),
  // First-touch 가입 유입 경로(UTM/외부 referrer/랜딩 경로) 버전드 JSONB 문서
  // (lib/types/signup-source.ts SignupSourceV1). onboarding 과 동일 패턴 — 새 유입
  // 필드 추가는 DDL 없이 타입 수정만. 모든 가입 경로(초대/canonical-PG 합류 포함)에서
  // 채워진다 — lib/auth/finalize-signup.ts 참조.
  signupSource: jsonb('signup_source').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Auto-maintained by the `set_updated_at` trigger (see 0000 migration).
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
