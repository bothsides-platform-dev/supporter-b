-- Apply before enabling GUEST_RFP_SLACK_THREADS_ENABLED. No historical backfill.
CREATE TABLE IF NOT EXISTS guest_journeys (
  draft_id uuid PRIMARY KEY,
  secret_hash text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  deleted_at timestamptz,
  channel text,
  root_ts text,
  analytics_ts text,
  analytics jsonb NOT NULL DEFAULT '[]',
  analytics_version integer NOT NULL DEFAULT 1,
  analytics_sent_version integer NOT NULL DEFAULT 0,
  CONSTRAINT guest_journey_owner_check CHECK (num_nonnulls(user_id,workspace_id) IN (0,2))
);
CREATE TABLE IF NOT EXISTS guest_journey_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES guest_journeys(draft_id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('root','analytics','events')),
  text text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','inflight','sent','unknown','failed')),
  analytics_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  slack_ts text
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_journey_root_idx ON guest_journey_batches(draft_id) WHERE kind='root';
CREATE INDEX IF NOT EXISTS guest_journey_batch_pending_idx ON guest_journey_batches(status,next_at);
CREATE TABLE IF NOT EXISTS guest_journey_events (
  draft_id uuid NOT NULL REFERENCES guest_journeys(draft_id) ON DELETE CASCADE,
  id text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid REFERENCES guest_journey_batches(id) ON DELETE SET NULL,
  PRIMARY KEY(draft_id,id)
);
CREATE INDEX IF NOT EXISTS guest_journey_event_pending_idx ON guest_journey_events(draft_id,observed_at) WHERE batch_id IS NULL;
CREATE TABLE IF NOT EXISTS guest_journey_gate (
  id integer PRIMARY KEY CHECK (id=1),
  next_at timestamptz NOT NULL
);
INSERT INTO guest_journey_gate VALUES(1, '1970-01-01') ON CONFLICT DO NOTHING;
