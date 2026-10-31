BEGIN;
ALTER TABLE bids ALTER COLUMN signup_fee DROP NOT NULL, ALTER COLUMN signup_fee DROP DEFAULT;
ALTER TABLE bids ALTER COLUMN guarantee_insurance DROP NOT NULL, ALTER COLUMN guarantee_insurance DROP DEFAULT;
CREATE TABLE IF NOT EXISTS bid_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE CASCADE,
  round_key text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  submitted_bid_id uuid REFERENCES bids(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bid_drafts_scope_unique UNIQUE (user_id, workspace_id, rfp_id, round_key)
);
CREATE INDEX IF NOT EXISTS bid_drafts_owner_idx ON bid_drafts(user_id, workspace_id);
-- No data backfill: historic zero has no reliable free/not-applicable meaning.
COMMIT;
