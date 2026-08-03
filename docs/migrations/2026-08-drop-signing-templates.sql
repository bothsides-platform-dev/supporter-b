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
-- **한 번만 실행된다.** 매 구문에 IF EXISTS 가 붙어 있지만 재실행은 안전하지 않다 —
-- Postgres 는 CTAS 의 하위 SELECT 를 존재 검사보다 먼저 분석하므로, 두 번째 실행은
-- `column signing_template_id does not exist` 로 **중단**된다. BEGIN + ON_ERROR_STOP
-- 이라 아무것도 적용되지 않으니 피해는 없다 — 그 에러가 곧 "이미 성공했다"는 뜻이다.
--
-- 롤백: **순서가 앞과 반대다** — 이 SQL 을 먼저 돌리고 그 다음 앱을 되돌린다.
-- (복원된 컬럼·테이블은 새 코드에 무해하지만, 그 반대는 구코드가 없는 테이블을
--  읽어 단일 프로세스 운영이 그대로 멈춘다 — 헤더가 경고하는 바로 그 장애다.)
--
--   BEGIN;
--   ALTER TABLE backup.pg_signing_templates_backup SET SCHEMA public;
--   ALTER TABLE pg_signing_templates_backup RENAME TO pg_signing_templates;
--   ALTER TABLE bids ADD COLUMN signing_template_id uuid
--     CONSTRAINT bids_signing_template_id_pg_signing_templates_id_fk
--     REFERENCES pg_signing_templates(id) ON DELETE SET NULL;
--   -- 워크스페이스 삭제가 백업 표에 CASCADE 로 닿았을 수 있다(RENAME 이 FK 를
--   -- 보존하므로). 사라진 템플릿을 가리키는 행은 건너뛰어야 FK 가 롤백 전체를
--   -- 되돌리지 않는다.
--   UPDATE bids b SET signing_template_id = k.signing_template_id
--     FROM backup.bids_signing_template k
--    WHERE k.id = b.id
--      AND EXISTS (SELECT 1 FROM pg_signing_templates t WHERE t.id = k.signing_template_id);
--   CREATE INDEX bids_signing_template_idx ON bids (signing_template_id)
--     WHERE signing_template_id IS NOT NULL;
--   COMMIT;
--
-- ⚠️ 백업 표는 `public` 이 아니라 **`backup` 스키마**에 둔다. drizzle-kit 은 `public`
-- 만 조정하는데, 배포마다 도는 `pnpm db:push` 는 스키마 파일에 없는 표를 보면 DROP 을
-- 제안한다 — 롤백 창 한가운데서 유일한 복구 수단이 조용히 사라진다는 뜻이다.
-- (이 레포는 push 가 모르는 표를 지우는 사고를 이미 겪었다.)
--
-- 원본 테이블을 CTAS(`CREATE TABLE … AS SELECT *`)로 뜨지 않고 **이름만 바꾸는** 이유:
-- CTAS 사본에는 PK·UNIQUE·FK·기본값이 하나도 따라오지 않는다. 그러면 위 롤백의
-- `REFERENCES pg_signing_templates(id)` 가 "there is no unique constraint matching
-- given keys" 로 그 자리에서 실패한다 — 롤백이 필요한 순간에야 그 사실을 알게 된다.
-- RENAME 은 제약·인덱스를 전부 데리고 가므로 되돌리기가 대칭이 된다(그리고 더 싸다).
--
-- 보존 안 하는 것: `signing_contracts.snowsign_template_id` 는 **남긴다**. 이미 발송된
-- 옛 계약이 어떤 계약서를 썼는지 가리키는 이력이고, 앱은 이제 쓰지 않지만(신규 발송은
-- NULL) 봉인 경계상 구매사에게는 계속 벗겨져 나간다(`stripProviderRefs`).

\set ON_ERROR_STOP on

-- 신형 생존 가드 (PR#470 재도입 이후 추가) — 이 스크립트는 **구형**(role_mapping
-- 보유) 테이블 전용이다. 템플릿이 재도입된 뒤의 신형 테이블이 살아 있는 DB 에서
-- 실수로 재실행하면, 예전에는 backup 이름 충돌이 우연히 막아 줬지만 backup 표를
-- 폐기한 뒤에는 끝까지 성공해 버린다 — 신형 표가 backup 으로 밀려나고
-- bids.signing_template_id 가 드랍되어 PG 딜룸·견적 제출이 죽는다(단일 PM2 fork).
-- 그래서 대상 표의 "형태"를 보고 멈춘다: role_mapping 이 없으면 이 스크립트의
-- 대상이 아니다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'pg_signing_templates'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pg_signing_templates'
       AND column_name = 'role_mapping'
  ) THEN
    RAISE EXCEPTION 'public.pg_signing_templates 가 신형(재도입, role_mapping 없음)이다 — '
      '이 드랍 스크립트의 대상이 아니다. 재실행 금지.';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS backup;

BEGIN;

-- DDL 이 `bids` 에 ACCESS EXCLUSIVE 를 잡는다. 딜룸·게시판 요청마다 읽는 뜨거운
-- 표라, 진행 중인 읽기 뒤에 줄을 서면 그 뒤의 모든 bids 쿼리까지 함께 막힌다 —
-- 단일 프로세스(PM2 fork, instances:1)에는 흡수해 줄 두 번째 워커가 없다.
-- 빨리 실패하고 한산할 때 다시 돌리는 편이 낫다.
SET LOCAL lock_timeout = '3s';

-- 견적별 사전 선택 스냅샷. 이쪽은 롤백이 평범한 UPDATE 조인이라 제약이 필요 없어
-- CTAS 로 충분하다.
CREATE TABLE IF NOT EXISTS backup.bids_signing_template AS
  SELECT id, signing_template_id FROM bids WHERE signing_template_id IS NOT NULL;

-- 참조하는 쪽부터 — bids 의 FK 컬럼과 그 부분 인덱스.
DROP INDEX IF EXISTS bids_signing_template_idx;
ALTER TABLE bids DROP COLUMN IF EXISTS signing_template_id;

-- 템플릿 테이블은 DROP 이 아니라 RENAME 이다 — 제약·인덱스를 통째로 보존해
-- 롤백이 대칭이 되게 한다. 그리고 `backup` 스키마로 옮겨 db:push 의 사정권 밖에 둔다.
ALTER TABLE IF EXISTS pg_signing_templates RENAME TO pg_signing_templates_backup;
ALTER TABLE IF EXISTS pg_signing_templates_backup SET SCHEMA backup;

COMMIT;

-- 백업 표 둘은 롤백 창이 지난 뒤 수동으로 지운다:
--   DROP TABLE backup.pg_signing_templates_backup;  -- FK 참조가 이미 사라져 그냥 지워진다
--   DROP TABLE backup.bids_signing_template;

-- ─────────────────────────────────────────────────────────────────────────────
-- provider_ref 선착순 제약 (v0.4.37.0, 배포 순서 무관 — additive)
--
-- 한 스노우싸인 계약은 우리 계약 행 하나만 쥘 수 있다. 서비스의 사전 검사는
-- 트랜잭션 밖 read-then-write 라 동시 요청 둘이 나란히 통과한다 — 선착순을 실제로
-- 정하는 건 이 제약이다. 두 행이 같은 provider 계약을 쥐면 상태·완료본이 서로를
-- 덮어쓰고, reconcileByProviderRef 가 limit(1) 이라 한쪽 딜룸은 낡은 상태에 갇힌다.
--
-- `db:push` 가 스키마 파일에서 이 인덱스를 만들어 주지만, 기존 데이터에 중복이
-- 있으면 생성이 실패한다. 먼저 아래로 확인한다(0 행이어야 정상):
--   SELECT provider_ref, count(*) FROM signing_contracts
--    WHERE provider_ref IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS signing_contracts_provider_ref_uniq
  ON signing_contracts (provider_ref)
  WHERE provider_ref IS NOT NULL;
