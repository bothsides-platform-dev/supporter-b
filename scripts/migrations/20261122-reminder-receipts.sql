BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE outbox_entries
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_event text,
  ADD COLUMN IF NOT EXISTS provider_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS outbox_reminder_rfp_idx ON outbox_entries
  (split_part(dedupe_key, ':', 2)) WHERE event = 'rfp.deadline_reminder';
COMMIT;
