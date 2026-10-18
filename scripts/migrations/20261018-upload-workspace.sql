-- New reservations pin their issuing workspace. Legacy downloads are unaffected;
-- legacy incomplete uploads must be reserved again (NULL fails closed).
BEGIN;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS upload_workspace_id uuid;
COMMIT;
