-- 견적별 계약서 템플릿 (v0.4.33.0) — PHASE 2: 새 코드 배포가 **끝난 뒤** 실행
--
-- ⚠️ 배포 전에 실행하면 장애가 난다. 구코드의 repo 는 `pg_signing_templates` 를
-- 전부 bare `.select()` 로 읽고, drizzle 이 이를 is_default 를 포함한 명시적
-- 컬럼 목록으로 펼친다 — 즉 컬럼을 먼저 지우면 award 경로뿐 아니라
-- /signing-templates 페이지·템플릿 링크 등 **모든** 템플릿 조회가 깨진다.
--
-- 운영은 PM2 `instances: 1, exec_mode: 'fork'` 단일 프로세스라 진짜 롤링 창은
-- 없다 — 구코드가 재시작 전까지 계속 트래픽을 받기 때문에 순서가 중요하다.
--
-- 전제: PHASE 1(`-1-expand.sql`)이 이미 실행됐고 `pm2 reload` 가 끝났다.
--
-- 롤백: 이 DROP 은 비가역이다. 앱을 되돌려야 하면 먼저 컬럼을 복원한다 —
--   ALTER TABLE pg_signing_templates ADD COLUMN is_default boolean NOT NULL DEFAULT false;
--   UPDATE pg_signing_templates t SET is_default = b.is_default
--     FROM pg_signing_templates_is_default_backup b WHERE b.id = t.id;

\set ON_ERROR_STOP on

ALTER TABLE pg_signing_templates DROP COLUMN IF EXISTS is_default;

-- 백업 표(`pg_signing_templates_is_default_backup`)는 롤백 창이 지난 뒤
-- 수동으로 지운다: DROP TABLE pg_signing_templates_is_default_backup;
