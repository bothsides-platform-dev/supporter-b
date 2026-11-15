-- 운영자 콘솔(admin-supporter-b) 관리자 허용 목록 + TOTP 2차 인증.
-- additive 테이블 1개. 기존 테이블을 바꾸지 않아 구 bidit·구 admin과 공존한다.
-- 재실행 안전(IF NOT EXISTS). lib/db/schema/admin-users.ts 의 drizzle DDL과 동일하므로
-- 적용 뒤 `pnpm db:push` 계획은 이 테이블에 대해 no-op 이어야 한다.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_users_email_lower" CHECK ("admin_users"."email" = lower("admin_users"."email"))
);
COMMIT;

-- 시드는 이 파일에 넣지 않는다(운영 이메일을 Git에 남기지 않기 위해). 적용 직후 admin 서버의
-- 현재 ADMIN_EMAILS 값을 소문자로 넣는다:
--   INSERT INTO admin_users (email, created_by)
--   VALUES ('ops@example.com', 'migration:env'), ...
--   ON CONFLICT (email) DO NOTHING;
