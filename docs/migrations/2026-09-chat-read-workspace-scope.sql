-- v0.5.7.0: bind conversation read cursors to the workspace used when reading.
--
-- Existing rows predate workspace_id and carry no immutable record of which
-- workspace was active when the read happened. Current membership is not proof:
-- a user may have left one side and later joined the other. Reset every legacy
-- cursor rather than guessing. A missing cursor produces an unread indicator,
-- while a wrong guess could falsely tell the sender that the counterparty read.
--
-- Run immediately before deploying v0.5.7.0. The transaction takes an
-- ACCESS EXCLUSIVE lock while the key changes; the old app cannot write a
-- workspace_id and should not remain active after this transaction commits.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE chat_conversation_reads
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

DELETE FROM chat_conversation_reads
WHERE workspace_id IS NULL;

ALTER TABLE chat_conversation_reads
  ALTER COLUMN workspace_id SET NOT NULL;

DO $$
DECLARE
  existing_primary_key text;
BEGIN
  SELECT conname INTO existing_primary_key
  FROM pg_constraint
  WHERE conrelid = 'chat_conversation_reads'::regclass
    AND contype = 'p';

  IF existing_primary_key IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE chat_conversation_reads DROP CONSTRAINT %I',
      existing_primary_key
    );
  END IF;
END $$;

ALTER TABLE chat_conversation_reads
  ADD CONSTRAINT chat_conversation_reads_conversation_id_workspace_id_user_id_pk
  PRIMARY KEY (conversation_id, workspace_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ccr_workspace_id_fk'
  ) THEN
    ALTER TABLE chat_conversation_reads
      ADD CONSTRAINT ccr_workspace_id_fk
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
