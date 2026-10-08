-- Stop admin writes and deploy the compatible buyer app before running this migration.
-- Start the new admin app after migration; tier fee entry is always enabled.
-- Only recommendation policy rates are reset. Never update reviews or audit logs.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS app_data_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
LOCK TABLE pg_matching_policies, pg_matching_defaults IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  INSERT INTO app_data_migrations (id) VALUES ('20261008-pg-tier-fees') ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE pg_matching_policies SET policy = jsonb_set(policy, '{candidates}', (
      SELECT COALESCE(jsonb_agg(
        (candidate - 'feeMin' - 'feeMax') || jsonb_build_object('feesByTier',
          jsonb_build_object('sole', NULL, 'sme1', NULL, 'sme2', NULL, 'sme3', NULL, 'general', NULL))
        ORDER BY position), '[]'::jsonb)
      FROM jsonb_array_elements(policy->'candidates') WITH ORDINALITY AS c(candidate, position)
    )), updated_at = now();
    UPDATE pg_matching_defaults SET policy = jsonb_set(policy, '{candidates}', (
      SELECT COALESCE(jsonb_agg(
        (candidate - 'feeMin' - 'feeMax') || jsonb_build_object('feesByTier',
          jsonb_build_object('sole', NULL, 'sme1', NULL, 'sme2', NULL, 'sme3', NULL, 'general', NULL))
        ORDER BY position), '[]'::jsonb)
      FROM jsonb_array_elements(policy->'candidates') WITH ORDINALITY AS c(candidate, position)
    )), updated_at = now();
  END IF;
END $$;
COMMIT;
