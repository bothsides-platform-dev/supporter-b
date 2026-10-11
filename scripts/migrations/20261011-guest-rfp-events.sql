CREATE TABLE IF NOT EXISTS guest_rfp_events (
 draft_id uuid NOT NULL,
 event text NOT NULL CHECK (event IN ('started', 'completed')),
 result text NOT NULL DEFAULT 'claimed' CHECK (result IN ('claimed', 'sent', 'failed', 'skipped')),
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 PRIMARY KEY (draft_id, event)
);
