-- Run BEFORE `pnpm db:push` and BEFORE deploying this release's code.
--
-- Why: MerchantGrade(영세='small') and MerchantTier(영세='sole') were unified into
-- a single MerchantTier type. The Postgres `merchant_grade` enum value 'small' is
-- renamed to 'sole' in-place. This is a metadata rename: existing rows holding
-- 'small' automatically read back as 'sole' (no data rewrite, no row downtime).
--
-- Ordering matters: `drizzle-kit push` cannot rename an enum value — it would see
-- 'small' removed + 'sole' added and partial-fail (Postgres refuses to drop an enum
-- value still in use). Run THIS first so the live enum matches the schema, then push
-- sees no enum diff.
--
-- Idempotent: the DO block is a no-op if 'small' is already absent (e.g., re-run, or
-- a fresh DB that never had 'small').
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'merchant_grade' AND e.enumlabel = 'small'
  ) THEN
    ALTER TYPE merchant_grade RENAME VALUE 'small' TO 'sole';
  END IF;
END
$$;
