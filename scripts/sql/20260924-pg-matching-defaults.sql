-- Apply before both apps. Additive only: no automatic industry imports or PG assignment.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE pg_recommendation_groups ADD COLUMN IF NOT EXISTS mcc_code text;
ALTER TABLE pg_recommendation_groups ADD COLUMN IF NOT EXISTS mcc_version text;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pg_recommendation_groups'::regclass
      AND conname = 'pg_recommendation_groups_mcc_code_unique'
  ) THEN
    ALTER TABLE pg_recommendation_groups
      ADD CONSTRAINT pg_recommendation_groups_mcc_code_unique UNIQUE (mcc_code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pg_matching_defaults (
  id text PRIMARY KEY DEFAULT 'default',
  policy jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pg_matching_defaults_singleton CHECK (id = 'default')
);
COMMIT;
