-- Run before deploying admin gate to production.
-- Sets all pre-existing workspaces to active (bypasses pending gate for existing users).
UPDATE workspaces SET status = 'active' WHERE status = 'pending' AND created_at < '2026-05-27';
