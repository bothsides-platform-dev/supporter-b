-- Apply before the app rollout. No existing data is modified.
CREATE TABLE IF NOT EXISTS "guest_rfp_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"answers" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"member_attachment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"application_id" uuid,
	"request_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"completed_rfp_id" uuid,
	"completed_at" timestamp with time zone,
	"auto_resume_consumed_at" timestamp with time zone,
	"resume_consumed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "guest_draft_owner_check" CHECK (num_nonnulls("guest_rfp_drafts"."user_id", "guest_rfp_drafts"."workspace_id", "guest_rfp_drafts"."application_id") IN (0,3)),
	CONSTRAINT "guest_draft_revision_check" CHECK ("guest_rfp_drafts"."revision" > 0)
);


CREATE TABLE IF NOT EXISTS "guest_rfp_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attachment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_file_status_check" CHECK ("guest_rfp_files"."status" IN ('pending','ready','deleting')),
	CONSTRAINT "guest_file_size_check" CHECK ("guest_rfp_files"."size" BETWEEN 1 AND 20971520)
);


DO $$ BEGIN ALTER TABLE "guest_rfp_drafts" ADD CONSTRAINT "guest_rfp_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "guest_rfp_drafts" ADD CONSTRAINT "guest_rfp_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "guest_rfp_drafts" ADD CONSTRAINT "guest_rfp_drafts_application_id_verification_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "guest_rfp_drafts" ADD CONSTRAINT "guest_rfp_drafts_completed_rfp_id_rfps_id_fk" FOREIGN KEY ("completed_rfp_id") REFERENCES "public"."rfps"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "guest_rfp_files" ADD CONSTRAINT "guest_rfp_files_draft_id_guest_rfp_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."guest_rfp_drafts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "guest_rfp_files" ADD CONSTRAINT "guest_rfp_files_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "guest_draft_owner_idx" ON "guest_rfp_drafts" USING btree ("user_id","workspace_id");

CREATE INDEX IF NOT EXISTS "guest_draft_expiry_idx" ON "guest_rfp_drafts" USING btree ("expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "guest_file_client_idx" ON "guest_rfp_files" USING btree ("draft_id","client_id") WHERE "guest_rfp_files"."status" <> 'deleting';
