-- Unified kanban cutover: bids.buyer_stage is superseded by columns +
-- bid_placements (placement-or-default-landing). Drop the column + its enum.
-- Hand-written, idempotent (no db:generate — snapshot chain not maintained).
-- buyer_stage values are intentionally NOT migrated to placements: existing bids
-- start in the "진행전" default-landing column (data-discardable per directive).
ALTER TABLE "bids" DROP COLUMN IF EXISTS "buyer_stage";--> statement-breakpoint
DROP TYPE IF EXISTS "buyer_stage";
