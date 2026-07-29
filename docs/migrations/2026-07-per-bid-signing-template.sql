-- 견적별 계약서 템플릿 (v0.4.33.0)
--
-- 배경: 선정 시 PG 워크스페이스의 "기본 템플릿"(is_default) 하나로 전자서명이 자동
-- 발송됐다. 이제 어떤 계약서를 보낼지는 견적마다 고르고, 선정은 항상 대기 상태로만
-- 들어가며, PG가 딜룸에서 확인해야 발송된다.
--
-- 배포 순서가 중요하다. 1·2 는 배포 **전**, 3 은 새 코드가 전부 뜬 **뒤**에 돌린다 —
-- is_default 를 먼저 지우면 구코드 인스턴스의 award 경로(findDefaultByWorkspace)가
-- 없는 컬럼을 조회해 500 이 난다.

-- ── 1) 배포 전: 새 컬럼 (구코드와 호환) ─────────────────────────────────────
ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS signing_template_id uuid
  REFERENCES pg_signing_templates(id) ON DELETE SET NULL;

-- Postgres 는 FK 참조측을 자동 인덱싱하지 않는다 — 템플릿 삭제 시 SET NULL 이 bids 를
-- 통째로 훑는 걸 막는다.
CREATE INDEX IF NOT EXISTS bids_signing_template_idx ON bids(signing_template_id);

-- 발송 클레임 리스(CAS). PG 담당자 둘이 동시에 '보내기'를 눌러도 SnowSign 계약이
-- 한 건만 생기게 한다.
ALTER TABLE signing_contracts
  ADD COLUMN IF NOT EXISTS claimed_for_send_at timestamptz;

-- ── 2) 배포 전: 기존 대기 딜의 사전 선택 백필 ───────────────────────────────
-- is_default 를 지우기 전에 실행해야 한다. 이미 선정됐지만 아직 발송 안 된 딜은
-- 기존 기본 템플릿이 딜룸 픽커의 기본 선택으로 이어지도록 옮겨 준다.
UPDATE bids b
SET signing_template_id = t.id
FROM rfps r
JOIN signing_contracts sc ON sc.rfp_id = r.id AND sc.status = 'awaiting_pg_template'
JOIN pg_signing_templates t ON t.workspace_id = b.pg_ws_id AND t.is_default
WHERE r.awarded_bid_id = b.id
  AND b.signing_template_id IS NULL;

-- ── 3) 새 코드 배포 완료 후 ─────────────────────────────────────────────────
ALTER TABLE pg_signing_templates DROP COLUMN IF EXISTS is_default;
