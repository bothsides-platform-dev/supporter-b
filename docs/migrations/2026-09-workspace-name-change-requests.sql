SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS workspace_name_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 워크스페이스가 삭제돼도 심사 이력은 남아야 하므로 FK를 두지 않는다.
  workspace_id uuid NOT NULL,
  -- 감사 이력은 탈퇴 사용자보다 오래 살아야 하므로 users FK를 두지 않는다.
  requested_by_user_id uuid NOT NULL,
  current_name text NOT NULL,
  requested_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT workspace_name_change_requests_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT workspace_name_change_requests_name_changed_chk
    CHECK (current_name <> requested_name)
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_name_change_requests_one_pending_uniq
  ON workspace_name_change_requests (workspace_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_name_change_requests_workspace_submitted_idx
  ON workspace_name_change_requests (workspace_id, submitted_at, id);

CREATE INDEX IF NOT EXISTS workspace_name_change_requests_status_submitted_idx
  ON workspace_name_change_requests (status, submitted_at, id);
