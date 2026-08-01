-- 계약서 템플릿 폐지 (건별 임베드 발송으로 전환) — 새 코드 배포가 **끝난 뒤** 실행
--
-- 배경: 재사용 템플릿을 없애고, PG 가 선정된 딜룸에서 스노우싸인 임베드로 계약서를
-- 건마다 직접 올려 보내도록 바꿨다. `pg_signing_templates` 와 `bids.signing_template_id`
-- 를 읽거나 쓰는 코드는 새 배포에 하나도 남아 있지 않다.
--
-- ⚠️ 배포 전에 실행하면 장애가 난다. 구코드의 repo 는 이 테이블을 bare `.select()` 로
-- 읽고 drizzle 이 명시적 컬럼 목록으로 펼치므로, 테이블을 먼저 지우면 /signing-templates
-- 페이지·견적 위저드 픽커·딜룸 발송 경로가 전부 깨진다. 운영은 PM2 `instances: 1,
-- exec_mode: 'fork'` 단일 프로세스라 진짜 롤링 창이 없다 — 순서가 곧 안전이다.
--
-- 실행 순서:
--   1) 새 코드 배포 + `pm2 reload` 완료
--   2) 이 스크립트 실행
--
-- 롤백: 이 DROP 은 비가역이다. 앱을 되돌려야 하면 아래 백업 표에서 복원한다.
--   ALTER TABLE bids ADD COLUMN signing_template_id uuid REFERENCES pg_signing_templates(id) ON DELETE SET NULL;
--   (백업 표를 pg_signing_templates 로 되살린 뒤) UPDATE bids b SET signing_template_id = k.signing_template_id
--     FROM bids_signing_template_backup k WHERE k.id = b.id;
--
-- 보존 안 하는 것: `signing_contracts.snowsign_template_id` 는 **남긴다**. 이미 발송된
-- 옛 계약이 어떤 계약서를 썼는지 가리키는 이력이고, 앱은 이제 쓰지 않지만(신규 발송은
-- NULL) 봉인 경계상 구매사에게는 계속 벗겨져 나간다(`stripProviderRefs`).

\set ON_ERROR_STOP on

BEGIN;

-- 롤백 창을 위한 백업 — 링크 메타와 견적별 사전 선택을 통째로 떠 둔다.
CREATE TABLE IF NOT EXISTS pg_signing_templates_backup AS
  SELECT * FROM pg_signing_templates;

CREATE TABLE IF NOT EXISTS bids_signing_template_backup AS
  SELECT id, signing_template_id FROM bids WHERE signing_template_id IS NOT NULL;

-- 참조하는 쪽부터 — bids 의 FK 컬럼과 그 부분 인덱스.
DROP INDEX IF EXISTS bids_signing_template_idx;
ALTER TABLE bids DROP COLUMN IF EXISTS signing_template_id;

DROP TABLE IF EXISTS pg_signing_templates;

COMMIT;

-- 백업 표 둘은 롤백 창이 지난 뒤 수동으로 지운다:
--   DROP TABLE pg_signing_templates_backup;
--   DROP TABLE bids_signing_template_backup;
