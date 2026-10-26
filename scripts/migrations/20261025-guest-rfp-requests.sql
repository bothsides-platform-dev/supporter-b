BEGIN;
ALTER TABLE guest_rfp_drafts DROP CONSTRAINT IF EXISTS guest_draft_owner_check;
ALTER TABLE guest_rfp_drafts ADD CONSTRAINT guest_draft_owner_check CHECK (
  (user_id IS NULL AND workspace_id IS NULL AND application_id IS NULL)
  OR (user_id IS NOT NULL AND workspace_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS guest_rfp_requests (
  draft_id uuid PRIMARY KEY CONSTRAINT guest_rfp_requests_draft_id_guest_rfp_drafts_id_fk REFERENCES guest_rfp_drafts(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  pg_id uuid NOT NULL CONSTRAINT guest_rfp_requests_pg_id_workspaces_id_fk REFERENCES workspaces(id),
  pg_name text NOT NULL,
  days integer NOT NULL CONSTRAINT guest_request_days_check CHECK (days IN (3,5,10)),
  status text NOT NULL CONSTRAINT guest_request_status_check CHECK (status IN ('unbound','waiting','submitted','needs_action','canceled','expired')),
  confirmed_at timestamptz NOT NULL,
  attempted_at timestamptz,
  expires_at timestamptz,
  error text,
  rfp_code text,
  deadline timestamptz,
  effect_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS guest_request_waiting_idx ON guest_rfp_requests(status, expires_at);
COMMIT;
