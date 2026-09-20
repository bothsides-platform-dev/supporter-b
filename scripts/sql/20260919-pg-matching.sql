-- Additive rollout. Run on the intended DB before either application deploy.
-- Existing requests and legacy recommendation assignments are preserved.
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.matching_ended';

CREATE TABLE IF NOT EXISTS pg_matching_policies (
  group_id uuid PRIMARY KEY REFERENCES pg_recommendation_groups(id) ON DELETE CASCADE,
  policy jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rfp_matching_requests (
  rfp_id uuid PRIMARY KEY REFERENCES rfps(id) ON DELETE CASCADE,
  group_id uuid REFERENCES pg_recommendation_groups(id) ON DELETE SET NULL,
  industry_name text NOT NULL,
  risk text NOT NULL,
  buyer_ws_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  request_key uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rfp_matching_request_key ON rfp_matching_requests(buyer_ws_id, request_key);
CREATE TABLE IF NOT EXISTS rfp_pg_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfp_id uuid NOT NULL REFERENCES rfp_matching_requests(rfp_id) ON DELETE CASCADE,
  pg_ws_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  reason text NOT NULL DEFAULT '',
  candidate jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfp_pg_review_status CHECK (status IN ('requested', 'reviewing', 'quoted', 'rejected', 'withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS rfp_pg_review_pair ON rfp_pg_reviews(rfp_id, pg_ws_id);
CREATE UNIQUE INDEX IF NOT EXISTS rfp_pg_review_active ON rfp_pg_reviews(rfp_id) WHERE status IN ('requested', 'reviewing', 'quoted');
CREATE INDEX IF NOT EXISTS rfp_pg_review_pg ON rfp_pg_reviews(pg_ws_id);
