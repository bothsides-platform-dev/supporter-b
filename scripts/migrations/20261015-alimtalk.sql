BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_alimtalk_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS alimtalk_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 phone text NOT NULL,
 template text NOT NULL,
 rfp_code text NOT NULL,
 link_url text NOT NULL,
 dedupe_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0,
 scheduled_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 message_id text,
 last_error text
);
CREATE INDEX IF NOT EXISTS alimtalk_outbox_due_idx ON alimtalk_outbox(status, scheduled_at);
COMMIT;
