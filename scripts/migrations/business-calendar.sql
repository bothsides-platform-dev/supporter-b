\set ON_ERROR_STOP on
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.deadline_changed';
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.matching_buyer_ended';
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.deadline_reminder';
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.bidding_closed';
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'rfp.calendar_changed';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE rfp_pg_reviews
  DROP CONSTRAINT IF EXISTS rfp_pg_review_status;
ALTER TABLE rfp_pg_reviews
  ADD CONSTRAINT rfp_pg_review_status
  CHECK (status IN ('requested', 'reviewing', 'quoted', 'rejected', 'withdrawn', 'buyer_ended'));

CREATE TABLE IF NOT EXISTS business_calendar_write_lock (
  id text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS business_calendar_years (
  year integer PRIMARY KEY,
  holidays jsonb NOT NULL,
  source text NOT NULL,
  version text NOT NULL,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS business_calendar_exceptions (
  date date PRIMARY KEY,
  closed integer NOT NULL CHECK (closed IN (0, 1)),
  name text NOT NULL,
  source text NOT NULL,
  actor text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_calendar_exception_audit (
  id uuid PRIMARY KEY,
  date date NOT NULL,
  closed integer NOT NULL CHECK (closed IN (0, 1)),
  name text NOT NULL,
  source text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_calendar_exception_audit_date_idx
  ON business_calendar_exception_audit (date);

CREATE TABLE IF NOT EXISTS business_calendar_changes (
  id uuid PRIMARY KEY,
  date date NOT NULL,
  name text NOT NULL,
  source text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_calendar_changes_date_idx
  ON business_calendar_changes (date);

CREATE TABLE IF NOT EXISTS deadline_notification_deliveries (
  key text PRIMARY KEY,
  rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  deadline timestamptz NOT NULL,
  pg_ws_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  review_id uuid,
  round integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deadline_notification_deliveries_rfp_idx
  ON deadline_notification_deliveries (rfp_id);

COMMIT;
