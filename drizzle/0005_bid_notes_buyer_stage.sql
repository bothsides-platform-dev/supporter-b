-- Stage 3a: server-side cutover for buyer-side bid kanban + notes.
-- Previously held only in localStorage (lib/stores/bid-board.ts); Stage 3b/3c
-- wire repos/actions/UI to the rows created here.

-- 1. attachment_owner_kind enum: add 'bid_note'. Postgres 12+ allows ADD
--    VALUE in a transaction; drizzle migrate runs each chunk separately so
--    the new value is visible to all SQL below.
ALTER TYPE "public"."attachment_owner_kind" ADD VALUE IF NOT EXISTS 'bid_note';--> statement-breakpoint

-- 2. buyer_stage enum: brand-new tonal label for the buyer kanban column.
DO $$ BEGIN
  CREATE TYPE "public"."buyer_stage" AS ENUM('pending', 'negotiating', 'decided');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- 3. bids.buyer_stage column. Default 'pending' lets the migration apply on
--    existing rows without backfill — Stage 3c reads this column instead of
--    the localStorage label.
ALTER TABLE "bids"
  ADD COLUMN IF NOT EXISTS "buyer_stage" "buyer_stage" NOT NULL DEFAULT 'pending';--> statement-breakpoint

-- 4. bid_notes table.
CREATE TABLE IF NOT EXISTS "bid_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bid_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "bid_notes"
  ADD CONSTRAINT "bid_notes_bid_id_fk"
  FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_notes"
  ADD CONSTRAINT "bid_notes_author_id_fk"
  FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bid_notes_bid_idx" ON "bid_notes" USING btree ("bid_id", "created_at");
