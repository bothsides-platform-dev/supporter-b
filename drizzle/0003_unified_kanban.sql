-- Unified kanban: Columns + Placements abstraction for both boards
-- (home pipeline + RFP bid board). Hand-written per project convention (no
-- db:generate — snapshot chain intentionally not maintained). Idempotent DDL so
-- it applies cleanly whether the target already has the objects (prod
-- schema-reflect path) or not (fresh pglite test DB).
--
-- ADDITIVE ONLY. bids.buyer_stage is dropped in 0004 once all code references
-- are removed (M6 cutover). Workspace column seeding is added here in M2
-- alongside seed.ts (kept in parity by seed-parity.test).
DO $$ BEGIN
  CREATE TYPE "column_kind" AS ENUM('pipeline', 'rfp_bids');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "chip_color" AS ENUM('primary', 'tertiary', 'warning', 'error', 'surface');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "columns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "kind" "column_kind" NOT NULL,
  "title" text NOT NULL,
  "position" text NOT NULL,
  "color" "chip_color",
  "lifecycle_key" text,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rfp_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "column_id" uuid NOT NULL,
  "rfp_id" uuid NOT NULL,
  "position" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rfp_placements_rfp_id_unique" UNIQUE("rfp_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitation_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "column_id" uuid NOT NULL,
  "invitation_id" uuid NOT NULL,
  "position" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invitation_placements_invitation_id_unique" UNIQUE("invitation_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bid_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "column_id" uuid NOT NULL,
  "bid_id" uuid NOT NULL,
  "position" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bid_placements_bid_id_unique" UNIQUE("bid_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "columns" ADD CONSTRAINT "columns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rfp_placements" ADD CONSTRAINT "rfp_placements_column_id_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rfp_placements" ADD CONSTRAINT "rfp_placements_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitation_placements" ADD CONSTRAINT "invitation_placements_column_id_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invitation_placements" ADD CONSTRAINT "invitation_placements_invitation_id_rfp_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."rfp_invitations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bid_placements" ADD CONSTRAINT "bid_placements_column_id_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "bid_placements" ADD CONSTRAINT "bid_placements_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "columns_ws_kind_lifecycle_uniq" ON "columns" ("workspace_id","kind","lifecycle_key") WHERE "lifecycle_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "columns_ws_kind_idx" ON "columns" ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rfp_placements_column_idx" ON "rfp_placements" ("column_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_placements_column_idx" ON "invitation_placements" ("column_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_placements_column_idx" ON "bid_placements" ("column_id");
