-- Rename RFQ → RFP across schema (tables, columns, enums, indexes, constraints).
-- Companion to TS schema rename in lib/db/schema/*.

-- 1. Enum type rename
ALTER TYPE "public"."rfq_status" RENAME TO "rfp_status";--> statement-breakpoint

-- 2. Enum value rename — attachment_owner_kind
ALTER TYPE "public"."attachment_owner_kind" RENAME VALUE 'rfq_rfp' TO 'rfp';--> statement-breakpoint

-- 3. Enum value renames — outbox_event
ALTER TYPE "public"."outbox_event" RENAME VALUE 'rfq.invited' TO 'rfp.invited';--> statement-breakpoint
ALTER TYPE "public"."outbox_event" RENAME VALUE 'rfq.sent' TO 'rfp.sent';--> statement-breakpoint
ALTER TYPE "public"."outbox_event" RENAME VALUE 'rfq.awarded' TO 'rfp.awarded';--> statement-breakpoint

-- 4. Table renames
ALTER TABLE "rfqs" RENAME TO "rfps";--> statement-breakpoint
ALTER TABLE "rfq_invitations" RENAME TO "rfp_invitations";--> statement-breakpoint
ALTER TABLE "rfq_counters" RENAME TO "rfp_counters";--> statement-breakpoint

-- 5. Column renames (rfq_id → rfp_id)
ALTER TABLE "bids" RENAME COLUMN "rfq_id" TO "rfp_id";--> statement-breakpoint
ALTER TABLE "contracts" RENAME COLUMN "rfq_id" TO "rfp_id";--> statement-breakpoint
ALTER TABLE "rfp_invitations" RENAME COLUMN "rfq_id" TO "rfp_id";--> statement-breakpoint

-- 6. Index rename
ALTER INDEX "rfq_invitations_rfq_ws_uniq" RENAME TO "rfp_invitations_rfp_ws_uniq";--> statement-breakpoint

-- 7. Constraint renames — bids
ALTER TABLE "bids" RENAME CONSTRAINT "bids_rfq_pg_unique" TO "bids_rfp_pg_unique";--> statement-breakpoint
ALTER TABLE "bids" RENAME CONSTRAINT "bids_rfq_id_rfqs_id_fk" TO "bids_rfp_id_rfps_id_fk";--> statement-breakpoint
ALTER TABLE "bids" RENAME CONSTRAINT "bids_invitation_id_rfq_invitations_id_fk" TO "bids_invitation_id_rfp_invitations_id_fk";--> statement-breakpoint

-- 8. Constraint renames — contracts
ALTER TABLE "contracts" RENAME CONSTRAINT "contracts_rfq_id_unique" TO "contracts_rfp_id_unique";--> statement-breakpoint
ALTER TABLE "contracts" RENAME CONSTRAINT "contracts_rfq_id_rfqs_id_fk" TO "contracts_rfp_id_rfps_id_fk";--> statement-breakpoint

-- 9. Constraint renames — rfps (formerly rfqs)
ALTER TABLE "rfps" RENAME CONSTRAINT "rfqs_buyer_ws_id_workspaces_id_fk" TO "rfps_buyer_ws_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "rfps" RENAME CONSTRAINT "rfqs_biz_profile_id_biz_profiles_id_fk" TO "rfps_biz_profile_id_biz_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "rfps" RENAME CONSTRAINT "rfqs_awarded_bid_id_bids_id_fk" TO "rfps_awarded_bid_id_bids_id_fk";--> statement-breakpoint
ALTER TABLE "rfps" RENAME CONSTRAINT "rfqs_created_by_users_id_fk" TO "rfps_created_by_users_id_fk";--> statement-breakpoint
ALTER TABLE "rfps" RENAME CONSTRAINT "rfqs_share_token_unique" TO "rfps_share_token_unique";--> statement-breakpoint

-- 10. Constraint renames — rfp_invitations (formerly rfq_invitations)
ALTER TABLE "rfp_invitations" RENAME CONSTRAINT "rfq_invitations_token_hash_unique" TO "rfp_invitations_token_hash_unique";--> statement-breakpoint
ALTER TABLE "rfp_invitations" RENAME CONSTRAINT "rfq_invitations_rfq_id_rfqs_id_fk" TO "rfp_invitations_rfp_id_rfps_id_fk";--> statement-breakpoint
ALTER TABLE "rfp_invitations" RENAME CONSTRAINT "rfq_invitations_pg_ws_id_workspaces_id_fk" TO "rfp_invitations_pg_ws_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "rfp_invitations" RENAME CONSTRAINT "rfq_invitations_accepted_by_user_id_users_id_fk" TO "rfp_invitations_accepted_by_user_id_users_id_fk";
