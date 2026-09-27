-- Apply before deploying code that reads/writes bids.proposal_source_bid_id.
-- The source bid keeps ownership of its attachment; later bids only point to it.
ALTER TABLE bids ADD COLUMN IF NOT EXISTS proposal_source_bid_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bids_proposal_source_bid_id_bids_id_fk') THEN
    ALTER TABLE bids ADD CONSTRAINT bids_proposal_source_bid_id_bids_id_fk
      FOREIGN KEY (proposal_source_bid_id) REFERENCES bids(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bids_proposal_source_bid_idx
  ON bids (proposal_source_bid_id) WHERE proposal_source_bid_id IS NOT NULL;
