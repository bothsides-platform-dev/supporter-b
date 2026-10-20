-- Run and COMMIT before deploying admin, then buyer service (flag remains false).
-- Additive only: existing profiles, pending applications and approved workspaces stay unchanged.
ALTER TYPE grade_source ADD VALUE IF NOT EXISTS 'api_confirmed';
