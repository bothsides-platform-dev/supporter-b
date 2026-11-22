BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS admin_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid CONSTRAINT admin_followups_workspace_id_workspaces_id_fk REFERENCES workspaces(id) ON DELETE SET NULL,
  rfp_id uuid CONSTRAINT admin_followups_rfp_id_rfps_id_fk REFERENCES rfps(id) ON DELETE SET NULL,
  invitation_id uuid CONSTRAINT admin_followups_invitation_id_rfp_invitations_id_fk REFERENCES rfp_invitations(id) ON DELETE SET NULL,
  review_id uuid CONSTRAINT admin_followups_review_id_rfp_pg_reviews_id_fk REFERENCES rfp_pg_reviews(id) ON DELETE SET NULL,
  bid_id uuid CONSTRAINT admin_followups_bid_id_bids_id_fk REFERENCES bids(id) ON DELETE SET NULL,
  signing_id uuid CONSTRAINT admin_followups_signing_id_signing_contracts_id_fk REFERENCES signing_contracts(id) ON DELETE SET NULL,
  delivery_id uuid CONSTRAINT admin_followups_delivery_id_outbox_entries_id_fk REFERENCES outbox_entries(id) ON DELETE SET NULL,
  category text NOT NULL CONSTRAINT admin_followups_category CHECK (category IN ('contact','signing','delivery','terms')),
  title text NOT NULL, owner_id uuid CONSTRAINT admin_followups_owner_id_admin_users_id_fk REFERENCES admin_users(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL, channel_url text, version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  CONSTRAINT admin_followups_target CHECK (num_nonnulls(invitation_id, review_id, bid_id, delivery_id, signing_id) <= 1)
);
CREATE INDEX IF NOT EXISTS admin_followups_open_due_idx ON admin_followups(due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS admin_followups_rfp_idx ON admin_followups(rfp_id);
CREATE INDEX IF NOT EXISTS admin_followups_workspace_idx ON admin_followups(workspace_id);
CREATE TABLE IF NOT EXISTS admin_followup_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL CONSTRAINT admin_followup_updates_task_id_admin_followups_id_fk REFERENCES admin_followups(id) ON DELETE CASCADE,
  actor text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_followup_updates_task_idx ON admin_followup_updates(task_id,created_at);
COMMIT;
