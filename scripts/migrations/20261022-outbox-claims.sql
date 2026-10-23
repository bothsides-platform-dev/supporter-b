-- Additive outbox ownership. Keep columns/constraint when rolling back the app.
-- Run with psql -v ON_ERROR_STOP=1 BEFORE starting the new application.
-- Old workers ignore these claims: pause cron and drain/stop ALL old app
-- workers before starting new workers. A rolling old/new overlap is unsafe.
-- Existing scheduled_at values (including old five-minute leases) are preserved.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.outbox_entries
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

DO $$
DECLARE existing_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO existing_definition
    FROM pg_constraint
    WHERE conrelid = 'public.outbox_entries'::regclass
      AND conname = 'outbox_claim_pair_check';
  IF existing_definition IS NULL THEN
    ALTER TABLE public.outbox_entries ADD CONSTRAINT outbox_claim_pair_check
      CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL));
  ELSIF existing_definition NOT IN (
    'CHECK (((claim_token IS NULL) = (claim_expires_at IS NULL)))',
    'CHECK (((claim_token IS NULL) = (claim_expires_at IS NULL))) NOT VALID'
  ) THEN
    RAISE EXCEPTION 'Unexpected outbox_claim_pair_check definition: %', existing_definition;
  ELSE
    ALTER TABLE public.outbox_entries VALIDATE CONSTRAINT outbox_claim_pair_check;
  END IF;
END $$;
COMMIT;
