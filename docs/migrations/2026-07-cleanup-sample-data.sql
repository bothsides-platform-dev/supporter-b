-- Run BEFORE `pnpm db:push` for the "DB 샘플 시딩 시스템 제거" migration (stage 3 of
-- virtual-sample-onboarding). The onboarding sample experience is now a client-side
-- fixture (lib/onboarding/fixtures.ts) — no DB rows are created for it anymore. This
-- script purges rows left over from the OLD seeder (createWorkspaceInTx used to call
-- seedSampleRfpInTx/seedSamplePgRfpInTx on every signup) before the is_sample/is_demo/
-- sample_seeded_at columns are dropped by `pnpm db:push`.
--
-- DML ONLY — no DDL. Column drops happen via `pnpm db:push` in the next deploy step.
--
-- FK cascade verified against lib/db/schema (2026-07):
--   bids.rfp_id                 → rfps.id            ON DELETE CASCADE
--   rfp_invitations.rfp_id      → rfps.id            ON DELETE CASCADE
--   rfp_allowed_pg.rfp_id       → rfps.id            ON DELETE CASCADE
--   rfp_team_messages.rfp_id    → rfps.id            ON DELETE CASCADE
--   rfp_team_message_reads.rfp_id → rfps.id          ON DELETE CASCADE
--   rfp_requote_requests.rfp_id → rfps.id            ON DELETE CASCADE
--   contracts.rfp_id            → rfps.id            ON DELETE CASCADE
--   rfp_pg_requests.rfp_id      → rfps.id            ON DELETE CASCADE
--   attachments.rfp_id          → rfps.id            ON DELETE CASCADE
--   chat_messages.rfp_id        → rfps.id            ON DELETE SET NULL (not cascade —
--     harmless: it only nulls the optional RFP context tag on chat messages, no orphan)
--   workspace_members.workspace_id → workspaces.id   ON DELETE CASCADE
--   notifications.workspace_id  → workspaces.id      ON DELETE CASCADE
--   workspace_invitations.workspace_id → workspaces.id ON DELETE CASCADE
--   rfp_allowed_pg.pg_ws_id     → workspaces.id      ON DELETE CASCADE
--   rfp_team_messages.workspace_id → workspaces.id   ON DELETE CASCADE
--   rfp_requote_requests.workspace_id → workspaces.id ON DELETE CASCADE
--   workspace_logo_blobs.workspace_id → workspaces.id ON DELETE CASCADE
--   bids.pg_ws_id               → workspaces.id      NO ACTION (fine — the RFP delete
--     above cascades bids by rfp_id BEFORE the workspace delete runs, so no bid row
--     still references the demo PG workspace by the time it's deleted)
--   rfp_invitations.pg_ws_id    → workspaces.id      NO ACTION (same reasoning)
--
-- Demo fixtures created by the old seeder (verified against the removed
-- lib/server/onboarding/{sample-rfp,sample-pg-rfp}.ts before deletion):
--   - demo PG users:     demo-pg-{a,b,c}@sample.invalid  (is_system_account=true)
--   - demo buyer user:   demo-buyer@sample.invalid        (is_system_account=true)
--   - demo buyer biz_no: '0000000000'                     (biz_profiles.biz_no)

BEGIN;

-- Pre-counts (uncomment to sanity-check before running in prod):
-- SELECT count(*) AS sample_rfps FROM rfps WHERE is_sample = true;
-- SELECT count(*) AS demo_workspaces FROM workspaces WHERE is_demo = true;
-- SELECT count(*) AS demo_users FROM users WHERE email LIKE '%@sample.invalid' AND is_system_account = true;

-- 1) Sample RFPs — cascades bids/invitations/allowlist/attachments/team-messages/
--    requote-requests/contracts/pg-requests by rfp_id (all ON DELETE CASCADE above).
DELETE FROM rfps WHERE is_sample = true;

-- 2) Demo workspace memberships (belt-and-suspenders — workspace delete below would
--    cascade this too, but explicit is cheap and makes the script self-documenting).
DELETE FROM workspace_members WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_demo);

-- 3) Clear any user pointing at a demo workspace as their active workspace — no FK
--    declared on last_active_workspace_id (deliberately, to avoid a circular schema
--    import — see lib/db/schema/users.ts) so this must be done before the delete below.
UPDATE users SET last_active_workspace_id = NULL WHERE last_active_workspace_id IN (SELECT id FROM workspaces WHERE is_demo);

-- 4) Demo workspaces themselves (the 3 demo PGs + 1 shared demo buyer).
DELETE FROM workspaces WHERE is_demo = true;

-- 5) Demo/system users left behind by the old seeder.
DELETE FROM users WHERE email LIKE '%@sample.invalid' AND is_system_account = true;

-- 6) Demo buyer's biz_profile — orphaned now that its workspace is gone. Guarded by
--    NOT EXISTS so it never touches a biz_profile still referenced by a real workspace.
DELETE FROM biz_profiles WHERE biz_no = '0000000000' AND NOT EXISTS (
  SELECT 1 FROM workspaces w WHERE w.biz_profile_id = biz_profiles.id
);

-- Post-counts (uncomment to verify the cleanup):
-- SELECT count(*) AS sample_rfps_left FROM rfps WHERE is_sample = true;         -- expect 0
-- SELECT count(*) AS demo_workspaces_left FROM workspaces WHERE is_demo = true; -- expect 0
-- SELECT count(*) AS demo_users_left FROM users WHERE email LIKE '%@sample.invalid'; -- expect 0

COMMIT;
