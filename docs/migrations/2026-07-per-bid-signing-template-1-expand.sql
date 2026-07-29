-- 견적별 계약서 템플릿 (v0.4.33.0) — PHASE 1: 배포 **전**에 실행
--
-- 이 파일은 통째로 `psql -f` 해도 안전하다. 파괴적 변경(is_default DROP)은
-- 일부러 두 번째 파일(`-2-drop.sql`)로 분리했다 — 한 파일에 두면 배포 전에
-- 무심코 전체 실행했을 때 구코드가 없는 컬럼을 조회해 장애가 난다.
--
-- 배경: 선정 시 PG 워크스페이스의 "기본 템플릿"(is_default) 하나로 전자서명이
-- 자동 발송됐다. 이제 어떤 계약서를 보낼지는 견적마다 고르고, 선정은 항상 대기
-- 상태로만 들어가며, PG가 딜룸에서 확인해야 발송된다.

\set ON_ERROR_STOP on
BEGIN;

-- ── 새 컬럼 (구코드와 호환 — 구코드는 이 컬럼들을 모른다) ──────────────────
-- FK 이름을 명시한다. 생략하면 Postgres 가 `bids_signing_template_id_fkey` 로
-- 자동 명명하는데, drizzle 은 `<table>_<col>_<reftable>_<refcol>_fk` 규약을
-- 기대하므로 다음 `db:push` 가 같은 컬럼에 FK 를 하나 더 만든다.
ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS signing_template_id uuid
  CONSTRAINT bids_signing_template_id_pg_signing_templates_id_fk
  REFERENCES pg_signing_templates(id) ON DELETE SET NULL;

-- Postgres 는 FK 참조측을 자동 인덱싱하지 않는다 — 템플릿 삭제 시 SET NULL 이
-- bids 를 통째로 훑는 걸 막는다. 대부분의 행이 NULL 이라 부분 인덱스로 둔다
-- (FK RI 탐침은 `= $1` 이라 플래너가 NOT NULL 을 함의로 증명한다).
CREATE INDEX IF NOT EXISTS bids_signing_template_idx
  ON bids(signing_template_id) WHERE signing_template_id IS NOT NULL;

-- 발송 클레임 리스(CAS). PG 담당자 둘이 동시에 '보내기'를 눌러도 SnowSign
-- 계약이 한 건만 생기게 한다.
ALTER TABLE signing_contracts
  ADD COLUMN IF NOT EXISTS claimed_for_send_at timestamptz;

-- ── 기존 대기 딜의 사전 선택 백필 ───────────────────────────────────────────
-- 이미 선정됐지만 아직 발송 안 된 딜은 기존 기본 템플릿이 딜룸 픽커의 기본
-- 선택으로 이어지도록 옮겨 준다. `signing_template_id IS NULL` 조건 덕에
-- 재실행해도 안전하다(멱등).
--
-- 주의 1: UPDATE 대상(b)은 FROM 절의 JOIN 트리 안에서 참조할 수 없다.
--   `FROM rfps r JOIN pg_signing_templates t ON t.workspace_id = b.pg_ws_id`
--   는 `invalid reference to FROM-clause entry for table "b"` 로 죽는다.
--   그래서 콤마 조인으로 평탄화해 b 를 스코프에 둔다.
-- 주의 2: is_default 는 유일성 제약이 없었고 구 UI 체크박스가 기본 체크였다
--   — 워크스페이스당 기본 템플릿이 여러 개인 게 정상 상태다. 그런 경우
--   Postgres 는 아무거나 하나를 조용히 고른다. 잘못 고른 계약서가 실제로
--   발송될 수 있으므로, **기본이 정확히 하나일 때만** 백필하고 애매하면
--   NULL 로 남겨 PG 가 딜룸에서 직접 고르게 한다.
UPDATE bids b
SET signing_template_id = t.id
FROM rfps r, signing_contracts sc, pg_signing_templates t
WHERE sc.rfp_id = r.id
  AND sc.status = 'awaiting_pg_template'
  AND t.workspace_id = b.pg_ws_id
  AND t.is_default
  AND r.awarded_bid_id = b.id
  AND b.signing_template_id IS NULL
  AND (
    SELECT count(*) FROM pg_signing_templates d
    WHERE d.workspace_id = b.pg_ws_id AND d.is_default
  ) = 1;

-- is_default 를 되돌릴 수 있게 스냅샷을 남긴다. PHASE 2 의 DROP 은 비가역이라
-- 이 표가 없으면 앱 롤백 시 플래그를 복원할 방법이 없다.
CREATE TABLE IF NOT EXISTS pg_signing_templates_is_default_backup AS
  SELECT id, workspace_id, is_default FROM pg_signing_templates WHERE is_default;

COMMIT;

-- 백필이 못 건드린(기본 템플릿이 0개거나 2개 이상인) 대기 딜 확인용:
--   SELECT b.id, b.pg_ws_id FROM bids b
--   JOIN rfps r ON r.awarded_bid_id = b.id
--   JOIN signing_contracts sc ON sc.rfp_id = r.id AND sc.status='awaiting_pg_template'
--   WHERE b.signing_template_id IS NULL;
-- 이 딜들은 PG 가 딜룸 픽커에서 직접 고르면 된다 — 장애가 아니다.
