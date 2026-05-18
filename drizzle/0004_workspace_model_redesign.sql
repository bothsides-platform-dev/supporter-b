-- workspace 독립 모델 전환: domain 제거, workspace_invitations 신규

-- 1. workspaces: domain 컬럼/인덱스/CHECK 제거
ALTER TABLE "workspaces" DROP CONSTRAINT IF EXISTS "pg_domain_required";--> statement-breakpoint
DROP INDEX IF EXISTS "workspaces_domain_unique";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "domain";--> statement-breakpoint

-- 2. rfp_invitations: pg_email 제거, pg_ws_id NOT NULL 전환, 인덱스 재생성
DROP INDEX IF EXISTS "rfp_invitations_rfp_email_uniq";--> statement-breakpoint
ALTER TABLE "rfp_invitations" DROP COLUMN IF EXISTS "pg_email";--> statement-breakpoint
ALTER TABLE "rfp_invitations" ALTER COLUMN "pg_ws_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_invitations_rfp_ws_uniq" ON "rfp_invitations" USING btree ("rfp_id","pg_ws_id");--> statement-breakpoint

-- 3. rfps: allowed_pg_emails → allowed_pg_workspace_ids (uuid[])
ALTER TABLE "rfps" DROP COLUMN IF EXISTS "allowed_pg_emails";--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN IF NOT EXISTS "allowed_pg_workspace_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[];--> statement-breakpoint

-- 4. outbox_event enum에 workspace.invited 추가
ALTER TYPE "public"."outbox_event" ADD VALUE IF NOT EXISTS 'workspace.invited';--> statement-breakpoint

-- 5. workspace_invitation_status enum 신규
DO $$ BEGIN
  CREATE TYPE "public"."workspace_invitation_status" AS ENUM('pending', 'accepted', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 6. workspace_invitations 테이블 신규
CREATE TABLE IF NOT EXISTS "workspace_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "invited_email" text NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "status" "workspace_invitation_status" DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_fk"
  FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitations_ws_email_uniq"
  ON "workspace_invitations" USING btree ("workspace_id", lower("invited_email"));
