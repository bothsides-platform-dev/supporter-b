ALTER TYPE "public"."invitation_status" ADD VALUE 'draft' BEFORE 'pending';--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "share_token" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_invitations_rfp_email_uniq" ON "rfp_invitations" USING btree ("rfp_id",lower("pg_email"));--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_share_token_unique" UNIQUE("share_token");