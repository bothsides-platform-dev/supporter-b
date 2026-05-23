CREATE TYPE "public"."bid_status" AS ENUM('draft', 'submitted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."biz_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."chip_color" AS ENUM('primary', 'tertiary', 'warning', 'error', 'surface');--> statement-breakpoint
CREATE TYPE "public"."column_kind" AS ENUM('pipeline', 'rfp_bids');--> statement-breakpoint
CREATE TYPE "public"."grade_source" AS ENUM('user_confirmed', 'user_overridden', 'unset');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('draft', 'pending', 'opened', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."merchant_grade" AS ENUM('small', 'sme1', 'sme2', 'sme3', 'general');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."outbox_event" AS ENUM('auth.verify', 'auth.reset', 'auth.email-change', 'rfp.invited', 'rfp.sent', 'bid.submitted', 'rfp.awarded', 'workspace.invited');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rfp_status" AS ENUM('draft', 'sent', 'closed', 'cancelled', 'awarded');--> statement-breakpoint
CREATE TYPE "public"."settle_cycle" AS ENUM('D+0', 'D+1', 'D+2', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."tax_type" AS ENUM('general', 'simple', 'exempt');--> statement-breakpoint
CREATE TYPE "public"."verification_purpose" AS ENUM('signup_email', 'password_reset', 'email_change');--> statement-breakpoint
CREATE TYPE "public"."workspace_invitation_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workspace_type" AS ENUM('buyer', 'pg');--> statement-breakpoint
CREATE TABLE "attachment_blobs" (
	"attachment_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"rfp_id" uuid,
	"bid_id" uuid,
	"bid_note_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_single_owner" CHECK (num_nonnulls("attachments"."rfp_id", "attachments"."bid_id", "attachments"."bid_note_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "bid_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bid_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"pg_ws_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"settle_cycle" "settle_cycle" NOT NULL,
	"deposit" numeric(14, 2) NOT NULL,
	"setup_fee" numeric(14, 2) NOT NULL,
	"monthly_min" numeric(14, 2) NOT NULL,
	"bank_transfer_fee_pct" numeric(5, 3) NOT NULL,
	"easy_pay_fee_pct" numeric(5, 3) NOT NULL,
	"card_fees_by_issuer" jsonb,
	"overseas_card_fee_pct" numeric(5, 3),
	"memo" text DEFAULT '' NOT NULL,
	"status" "bid_status" DEFAULT 'submitted' NOT NULL,
	"board_column_id" uuid,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bids_rfp_pg_unique" UNIQUE("rfp_id","pg_ws_id")
);
--> statement-breakpoint
CREATE TABLE "biz_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biz_no" text,
	"tax_type" "tax_type",
	"status" "biz_status",
	"grade" "merchant_grade",
	"grade_source" "grade_source" NOT NULL,
	"grade_confirmed_by" uuid,
	"grade_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biz_profile_at_least_one_field" CHECK ("biz_profiles"."biz_no" IS NOT NULL OR "biz_profiles"."grade" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "column_kind" NOT NULL,
	"title" text NOT NULL,
	"position" text NOT NULL,
	"color" "chip_color",
	"lifecycle_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"bid_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by" uuid NOT NULL,
	CONSTRAINT "contracts_rfp_id_unique" UNIQUE("rfp_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"avatar_color" text DEFAULT '#000' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_active_workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "workspace_type" NOT NULL,
	"name" text NOT NULL,
	"biz_profile_id" uuid,
	"share_token" text DEFAULT gen_random_uuid()::text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "workspace_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rfps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"buyer_ws_id" uuid NOT NULL,
	"biz_profile_id" uuid,
	"title" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"share_token" text DEFAULT gen_random_uuid()::text NOT NULL,
	"status" "rfp_status" DEFAULT 'draft' NOT NULL,
	"awarded_bid_id" uuid,
	"created_by" uuid NOT NULL,
	"board_column_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "rfps_code_unique" UNIQUE("code"),
	CONSTRAINT "rfps_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "awarded_consistency" CHECK (("rfps"."awarded_bid_id" IS NULL) OR ("rfps"."status" = 'awarded'))
);
--> statement-breakpoint
CREATE TABLE "rfp_allowed_pg" (
	"rfp_id" uuid NOT NULL,
	"pg_ws_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_allowed_pg_rfp_id_pg_ws_id_pk" PRIMARY KEY("rfp_id","pg_ws_id")
);
--> statement-breakpoint
CREATE TABLE "rfp_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfp_id" uuid NOT NULL,
	"pg_ws_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"token_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"board_column_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfp_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"link_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_id_created_at_pk" PRIMARY KEY("id","created_at")
);
--> statement-breakpoint
CREATE TABLE "outbox_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" "outbox_event" NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"dedupe_key" text,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "verification_purpose" NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rfp_counters" (
	"year_month" text PRIMARY KEY NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_blobs" ADD CONSTRAINT "attachment_blobs_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_bid_note_id_bid_notes_id_fk" FOREIGN KEY ("bid_note_id") REFERENCES "public"."bid_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_notes" ADD CONSTRAINT "bid_notes_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_notes" ADD CONSTRAINT "bid_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_pg_ws_id_workspaces_id_fk" FOREIGN KEY ("pg_ws_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_invitation_id_rfp_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."rfp_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_board_column_id_columns_id_fk" FOREIGN KEY ("board_column_id") REFERENCES "public"."columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biz_profiles" ADD CONSTRAINT "biz_profiles_grade_confirmed_by_users_id_fk" FOREIGN KEY ("grade_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "columns" ADD CONSTRAINT "columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_biz_profile_id_biz_profiles_id_fk" FOREIGN KEY ("biz_profile_id") REFERENCES "public"."biz_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_buyer_ws_id_workspaces_id_fk" FOREIGN KEY ("buyer_ws_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_biz_profile_id_biz_profiles_id_fk" FOREIGN KEY ("biz_profile_id") REFERENCES "public"."biz_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_awarded_bid_id_bids_id_fk" FOREIGN KEY ("awarded_bid_id") REFERENCES "public"."bids"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_board_column_id_columns_id_fk" FOREIGN KEY ("board_column_id") REFERENCES "public"."columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_allowed_pg" ADD CONSTRAINT "rfp_allowed_pg_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_allowed_pg" ADD CONSTRAINT "rfp_allowed_pg_pg_ws_id_workspaces_id_fk" FOREIGN KEY ("pg_ws_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_pg_ws_id_workspaces_id_fk" FOREIGN KEY ("pg_ws_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_board_column_id_columns_id_fk" FOREIGN KEY ("board_column_id") REFERENCES "public"."columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_rfp_idx" ON "attachments" USING btree ("rfp_id") WHERE "attachments"."rfp_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_bid_idx" ON "attachments" USING btree ("bid_id") WHERE "attachments"."bid_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_bid_note_idx" ON "attachments" USING btree ("bid_note_id") WHERE "attachments"."bid_note_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bid_notes_bid_idx" ON "bid_notes" USING btree ("bid_id","created_at");--> statement-breakpoint
CREATE INDEX "bids_pg_ws_idx" ON "bids" USING btree ("pg_ws_id");--> statement-breakpoint
CREATE INDEX "bids_board_column_idx" ON "bids" USING btree ("board_column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "columns_ws_kind_lifecycle_uniq" ON "columns" USING btree ("workspace_id","kind","lifecycle_key") WHERE "columns"."lifecycle_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "columns_ws_kind_idx" ON "columns" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "contracts_bid_idx" ON "contracts" USING btree ("bid_id");--> statement-breakpoint
CREATE INDEX "workspaces_biz_profile_idx" ON "workspaces" USING btree ("biz_profile_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invitations_ws_email_uniq" ON "workspace_invitations" USING btree ("workspace_id",lower("invited_email"));--> statement-breakpoint
CREATE INDEX "rfps_buyer_ws_idx" ON "rfps" USING btree ("buyer_ws_id");--> statement-breakpoint
CREATE INDEX "rfps_awarded_bid_idx" ON "rfps" USING btree ("awarded_bid_id");--> statement-breakpoint
CREATE INDEX "rfps_board_column_idx" ON "rfps" USING btree ("board_column_id");--> statement-breakpoint
CREATE INDEX "rfp_allowed_pg_ws_idx" ON "rfp_allowed_pg" USING btree ("pg_ws_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_invitations_rfp_ws_uniq" ON "rfp_invitations" USING btree ("rfp_id","pg_ws_id");--> statement-breakpoint
CREATE INDEX "rfp_invitations_pg_ws_status_idx" ON "rfp_invitations" USING btree ("pg_ws_id","status");--> statement-breakpoint
CREATE INDEX "rfp_invitations_board_column_idx" ON "rfp_invitations" USING btree ("board_column_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key_unique" ON "outbox_entries" USING btree ("dedupe_key") WHERE "outbox_entries"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_entries" USING btree ("scheduled_at") WHERE "outbox_entries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "verification_email_purpose_idx" ON "verification_tokens" USING btree ("email","purpose");