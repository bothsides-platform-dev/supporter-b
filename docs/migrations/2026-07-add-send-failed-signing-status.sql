-- Run BEFORE `pnpm db:push` (and before the app deploys) for the SnowSign resilience
-- change (v0.4.2.0). Adds the 'send_failed' value to the signing_contract_status enum so
-- onAward can record a row when SnowSign is down at award time — the deal room then shows
-- "다시 시작" and the buyer is notified, instead of a silent dead-end. The new code INSERTs
-- status='send_failed'; without this value the insert fails with an invalid enum value.
--
-- Per docs/DEPLOY_LIGHTSAIL.md §스키마 변경 규약, enum changes that `db:push` can't apply
-- safely are committed here and applied via psql BEFORE `db:push`. `ADD VALUE ... IF NOT
-- EXISTS` is idempotent — safe to re-run.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so there is NO
-- BEGIN/COMMIT wrapper here (unlike the DML migrations in this folder).

ALTER TYPE signing_contract_status ADD VALUE IF NOT EXISTS 'send_failed';
