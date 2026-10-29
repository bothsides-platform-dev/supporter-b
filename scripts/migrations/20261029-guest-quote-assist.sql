BEGIN;
CREATE TABLE IF NOT EXISTS guest_quote_calls (
  draft_id uuid NOT NULL REFERENCES guest_rfp_drafts(id) ON DELETE CASCADE,
  kind text NOT NULL,
  input_hash text NOT NULL,
  result jsonb,
  cost double precision,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (draft_id, kind, input_hash),
  CONSTRAINT guest_quote_kind CHECK (kind IN ('business', 'website'))
);
CREATE INDEX IF NOT EXISTS guest_quote_call_expiry ON guest_quote_calls(expires_at);
CREATE TABLE IF NOT EXISTS guest_quote_ip_budget (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_quote_ip_expiry ON guest_quote_ip_budget(expires_at);
COMMIT;
