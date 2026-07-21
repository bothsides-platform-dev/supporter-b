-- Run BEFORE `pnpm db:push` and BEFORE deploying this release's code.
--
-- Why: `workspace_members.approval_status` is plain `text` with no constraint,
-- while the admin console that writes it lives in a SEPARATE repo
-- (`admin-supporter-b`) with no shared types. A drifted value ('Approved',
-- 'active', '') makes `isApprovedAdmin` return false, which is fail-closed at
-- the six permission gates but fail-OPEN at the account-deletion last-admin
-- block: the final real admin could delete their account and orphan the
-- workspace. The CHECK is the only place both repos are forced through.
--
-- Ordering matters: `drizzle-kit push` would emit this same ALTER, but if any
-- live row already holds a drifted value the ALTER fails and leaves the push
-- half-applied. Running it here first makes the failure loud, isolated, and
-- fixable before anything else moves.
--
-- BEFORE RUNNING, inspect what is actually in the column:
--
--   SELECT approval_status, count(*)
--   FROM workspace_members
--   GROUP BY approval_status;
--
-- Expect exactly: approved / pending_approval / rejected. If anything else
-- appears, STOP and reconcile those rows with the admin repo owner first —
-- do NOT blanket-UPDATE them to 'approved', because that would silently grant
-- effective admin to members who were never approved.
--
-- Idempotent: skips if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_members_approval_status_check'
  ) THEN
    ALTER TABLE workspace_members
      ADD CONSTRAINT workspace_members_approval_status_check
      CHECK (approval_status IN ('approved', 'pending_approval', 'rejected'));
  END IF;
END
$$;
