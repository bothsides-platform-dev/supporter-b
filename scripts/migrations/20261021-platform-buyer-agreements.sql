-- Run before the application. Never relabel legacy contracts or regenerate old awards.
BEGIN;
ALTER TABLE signing_contracts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pg_buyer';
ALTER TABLE contract_archives ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pg_buyer';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signing_contracts_kind_check') THEN
  ALTER TABLE signing_contracts ADD CONSTRAINT signing_contracts_kind_check CHECK (kind IN ('pg_buyer','platform_buyer'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contract_archives_kind_check') THEN
  ALTER TABLE contract_archives ADD CONSTRAINT contract_archives_kind_check CHECK (kind IN ('pg_buyer','platform_buyer'));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS platform_agreement_drafts (
 contract_id uuid PRIMARY KEY REFERENCES signing_contracts(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1,
 parties jsonb NOT NULL,
 prepared jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Keep email history; stop queued obsolete PG reminders before restarting the app.
UPDATE outbox_entries SET status='failed',attempts=max_attempts,last_error='Platform agreement transition: PG contract reminders retired'
 WHERE event='signing.awaiting_template' AND status='pending';
COMMIT;
