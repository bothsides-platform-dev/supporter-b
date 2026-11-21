-- 운영자 콘솔(admin-supporter-b) 패스키(WebAuthn) — TOTP에 더하는 2차 인증 수단.
-- additive 테이블 1개 + 인덱스 1개. admin_users 는 컬럼을 바꾸지 않고 FK 대상으로만 쓰므로
-- 구 bidit·구 admin과 공존한다. admin_users 가 먼저 있어야 한다(20261115-admin-users.sql).
-- 재실행 안전(IF NOT EXISTS, FK는 CREATE TABLE 안에 둔다). lib/db/schema/admin-passkeys.ts 의
-- drizzle DDL과 이름까지 같으므로 적용 뒤 `pnpm db:push` 계획은 이 테이블에 대해 no-op 이어야 한다.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS "admin_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" text[],
	"backup_eligible" boolean NOT NULL,
	"backed_up" boolean NOT NULL,
	"aaguid" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "admin_passkeys_credential_id_unique" UNIQUE("credential_id"),
	CONSTRAINT "admin_passkeys_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action
);
CREATE INDEX IF NOT EXISTS "admin_passkeys_admin_user_idx" ON "admin_passkeys" USING btree ("admin_user_id");
COMMIT;

-- 시드 없음. 행은 관리자가 운영자 콘솔에서 패스키를 등록할 때만 생긴다.
