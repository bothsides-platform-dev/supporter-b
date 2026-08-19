-- 조항형(composed) 계약서 서식 — 새 코드 배포 **전에** 실행
--
-- 배경: `pg_signing_templates` 가 두 종류를 담게 된다.
--   · kind='pdf'      — 기존 행. 완성된 PDF 를 스노우싸인에 올리고 서명칸을 배치한 것.
--                       문서와 좌표는 provider 에 있고 우리는 링크 id 만 든다.
--   · kind='composed' — 신규. 조항을 직접 작성한 것. **문서가 우리 DB(document)에 있고**
--                       provider 템플릿은 만들지 않는다(발송 시점에 렌더해 건별 계약).
--
-- ⚠️ **additive 지만 순서가 중요하다.** 신코드의 `TEMPLATE_COLUMNS` projection 이
-- kind/document/updated_at 을 조건 없이 SELECT 한다 — 컬럼이 없으면 PG 딜룸·견적
-- 제출·계약서 템플릿 목록이 **파스 타임에 전면 500** 이다(v0.4.42.0 사고와 같은 모양:
-- 행이 0건이어도 깨진다). 운영은 PM2 `instances: 1, exec_mode: 'fork'` 단일 프로세스라
-- 롤링 창이 없으므로 순서가 곧 안전이다.
--
-- 구코드에는 무해하다 — 구코드는 명시 projection 만 쓰므로 새 컬럼을 아예 보지 않고,
-- 구코드의 INSERT 는 항상 snowsign_template_id 를 채우므로 CHECK 를 통과한다
-- (kind 기본값이 'pdf' 라 기존 경로가 그대로 유효하다).
--
-- 실행 순서:
--   1) 이 스크립트 실행 (배포 전, 구코드가 도는 중에 안전)
--   2) 새 코드 배포 + `pm2 reload`
--   3) `pnpm db:push` 계획이 no-op 인지 확인 (스키마 파일과 이 DDL 이 일치해야 정상)
--
-- **재실행 안전.** 전 구문 IF NOT EXISTS / DO 가드 — 이미 적용된 DB 에서 no-op.
--
-- ⚠️ **롤백은 순서가 뒤집힌다 — 조항형 행을 먼저 지우고 그 다음 코드를 되돌린다.**
-- 구코드는 `kind` 를 모르고 kind 필터도 없으므로, 조항형 행이 남은 채 구코드가 뜨면
-- 그 행들이 **PDF 서식으로 읽혀** 서식 목록과 견적 위저드 피커에 `snowsignTemplateId`
-- 가 NULL 인 행으로 섞인다(구코드의 rowToTemplate 에는 NULL 가드가 없다).
--
-- ⚠️ **DELETE 는 서식만 지우는 것이 아니다.** `bids.signing_template_id` 가
-- `ON DELETE SET NULL` 이라, 조항형 서식을 골라 둔 **모든 견적의 서식 선택이 함께
-- 풀린다** — 그리고 그건 복구되지 않는다. 지우기 전에 스냅샷을 뜬다.
--
--   -- 0) 되돌릴 수 없는 것부터 백업
--   CREATE TABLE IF NOT EXISTS backup.bids_composed_template_backup AS
--     SELECT id, signing_template_id FROM bids
--      WHERE signing_template_id IN (SELECT id FROM pg_signing_templates WHERE kind = 'composed');
--   CREATE TABLE IF NOT EXISTS backup.pg_signing_templates_composed_backup AS
--     SELECT * FROM pg_signing_templates WHERE kind = 'composed';
--   -- 1) 구코드가 절대 못 보게 조항형 행을 먼저 없앤다
--   ALTER TABLE pg_signing_templates DROP CONSTRAINT IF EXISTS pg_signing_templates_kind_shape;
--   DELETE FROM pg_signing_templates WHERE kind = 'composed';
--   -- 2) 이제 구코드를 배포한다 (여기부터 아래는 급하지 않다)
--   ALTER TABLE pg_signing_templates ALTER COLUMN snowsign_template_id SET NOT NULL;
--   ALTER TABLE pg_signing_templates DROP COLUMN IF EXISTS document, DROP COLUMN IF EXISTS kind;
--   -- updated_at 은 무해하므로 남겨도 된다.

\set ON_ERROR_STOP on

BEGIN;

-- lock_timeout 만으로는 부족하다 — 락을 **잡은 뒤** CHECK 검증 스캔이 도는 시간은
-- 제한되지 않는다(ACCESS EXCLUSIVE 를 쥔 채 전 행을 읽는다). 두 개를 같이 건다.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- PG >= 11 에서 DEFAULT 를 가진 ADD COLUMN 은 카탈로그만 바꾼다(테이블 재작성 없음).
ALTER TABLE pg_signing_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pdf';

ALTER TABLE pg_signing_templates
  ADD COLUMN IF NOT EXISTS document jsonb;

ALTER TABLE pg_signing_templates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- composed 행은 provider 템플릿이 없다 — NOT NULL 을 풀어야 NULL 을 넣을 수 있다.
-- 카탈로그 전용 변경.
ALTER TABLE pg_signing_templates
  ALTER COLUMN snowsign_template_id DROP NOT NULL;

-- CHECK 는 **마지막**이다. 기존 행은 전부 kind='pdf' + provider id NOT NULL +
-- document NULL 이라 추가 즉시 valid 하다(위 세 구문이 먼저 돌아야 그 상태가 된다).
DO $$
BEGIN
  -- conrelid 로 테이블까지 한정한다 — 제약 이름은 스키마 전역에서 유일하지 않아,
  -- 이름만 보면 다른 테이블의 동명 제약 때문에 이 테이블에 CHECK 가 안 붙은 채
  -- 조용히 넘어갈 수 있다.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'pg_signing_templates'::regclass
       AND conname = 'pg_signing_templates_kind_shape'
  ) THEN
    ALTER TABLE pg_signing_templates
      ADD CONSTRAINT pg_signing_templates_kind_shape CHECK (
        (kind = 'pdf' AND snowsign_template_id IS NOT NULL AND document IS NULL)
        OR (kind = 'composed' AND snowsign_template_id IS NULL AND document IS NOT NULL)
      );
  END IF;
END $$;

COMMIT;

-- 적용 확인:
--   SELECT kind, count(*) FROM pg_signing_templates GROUP BY kind;
--   SELECT conname FROM pg_constraint WHERE conname = 'pg_signing_templates_kind_shape';
