-- Repair constraints omitted from existing calendar tables. No data backfill.
-- Run with psql -v ON_ERROR_STOP=1. Keep these additions on app rollback.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  table_name text;
  constraint_name text;
  existing_definition text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['business_calendar_exceptions', 'business_calendar_exception_audit']
  LOOP
    constraint_name := table_name || '_closed_check';
    -- Serialize inspection and repair, including concurrent migration runs.
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', table_name);
    SELECT pg_get_constraintdef(oid) INTO existing_definition
      FROM pg_constraint
      WHERE conrelid = format('public.%I', table_name)::regclass
        AND conname = constraint_name;

    IF existing_definition IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (closed IN (0, 1))',
        table_name, constraint_name);
    ELSIF existing_definition NOT IN (
      'CHECK ((closed = ANY (ARRAY[0, 1])))',
      'CHECK ((closed = ANY (ARRAY[0, 1]))) NOT VALID'
    ) THEN
      RAISE EXCEPTION 'Unexpected constraint definition for %.%: %',
        table_name, constraint_name, existing_definition;
    ELSE
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', table_name, constraint_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
