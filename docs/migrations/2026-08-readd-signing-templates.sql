-- 계약서 템플릿 재도입 (자체 PDF 에디터, PR#470) — 새 코드 배포 **전에** 실행
--
-- 배경: v0.4.37.0 이 `2026-08-drop-signing-templates.sql` 로 `pg_signing_templates` 와
-- `bids.signing_template_id` 를 드랍했는데, PR#470 이 같은 이름의 표·컬럼을 **신형
-- 스키마로** 다시 쓴다. 신코드는 이 표를 조건 없이 읽는다 — `rfp-detail-loader.ts` 의
-- `loadPgRfpDetail` 이 모든 PG 딜룸 진입에서 `listByWorkspace` 를 부르고, 견적 제출도
-- 소유 검증에서 이 표를 조회한다. 표가 없으면 **PG 딜룸·견적 제출 전면 500** 이다.
--
-- ⚠️ 드랍 스크립트와 **순서가 반대다**: 이 스크립트는 additive 라 구코드에 무해하고
-- (구코드는 이 표·컬럼을 아예 안 본다), 신코드는 표가 먼저 있어야 산다. 운영은 PM2
-- `instances: 1, exec_mode: 'fork'` 단일 프로세스 — 롤링 창이 없으므로 순서가 곧 안전이다.
--
-- 실행 순서:
--   1) 이 스크립트 실행 (배포 전, 구코드가 도는 중에 안전)
--   2) 새 코드 배포 + `pm2 reload`
--   3) `pnpm db:push` 계획이 no-op 인지 확인 (스키마 파일과 이 DDL 이 일치해야 정상)
--
-- **backup 스키마 복원이 아니다.** 드랍 때 `backup.pg_signing_templates_backup` 으로
-- 옮겨 둔 옛 표는 **구형 스키마**(role_mapping/variable_mapping 컬럼, 외부 링크 모델)라
-- 신코드와 맞지 않는다. 옛 템플릿 데이터는 의미상으로도 재사용 불가(스노우싸인 임베드
-- 링크 모델의 산물) — backup.* 는 건드리지 않고, 드랍 스크립트 하단의 정리 절차대로
-- 나중에 수동 폐기한다. `backup.bids_signing_template` 스냅샷도 같은 이유로 복원하지
-- 않는다.
--
-- **재실행 안전.** 전 구문 IF NOT EXISTS — 이미 적용된 DB 에서 다시 돌려도 no-op.
-- 드랍 스크립트가 아직 안 돈 DB(표가 public 에 살아 있는 구형)라면 먼저 실행 전
-- 확인 쿼리로 상태를 보고 중단한다 — 구형 표가 남은 채 이 스크립트를 돌리면
-- IF NOT EXISTS 가 구형 표를 그대로 두어 신코드가 구형 스키마를 읽게 된다.
--
-- 실행 전 확인 (둘 다 확인):
--   \d pg_signing_templates
--     → "Did not find any relation" 이어야 정상 (v0.4.37.0 드랍이 적용된 상태).
--       표가 **존재**하고 role_mapping 컬럼이 보이면 구형이 살아 있는 것 — 중단하고
--       상태를 보고한다 (드랍 스크립트가 이 DB 에 적용됐는지부터 확인).
--   \d backup.pg_signing_templates_backup
--     → 있으면 그대로 둔다 (복원 금지 — 구형).
--
-- 롤백: 이 DDL 은 additive 라 구코드 롤백(앱만 이전 버전으로)에 아무 조치가 필요
-- 없다. 표·컬럼을 굳이 지우려면 드랍 스크립트를 다시 쓰면 되지만, 빈 표를 지울
-- 이유는 없다.

\set ON_ERROR_STOP on

BEGIN;

-- 구형 생존 가드 — 주석이 아니라 실행되는 검사다. 드랍이 적용 안 된 DB(스테이징·
-- 로컬 공유 :5432 등)에서 구형 표(role_mapping 보유, 신형의 컬럼 superset)가 살아
-- 있으면 아래 IF NOT EXISTS 가 전부 이름 충돌로 no-op 되어 exit 0 으로 "성공"을
-- 위장한다 — 그리고 실패는 지연돼서 온다(SELECT 는 되고, 템플릿 생성 INSERT 가
-- role_mapping NOT NULL 위반으로 죽는데 그 시점엔 PDF 가 이미 스노우싸인에
-- 올라간 뒤다). 사람이 \d 를 읽는 것에 기대지 않고 여기서 멈춘다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pg_signing_templates'
       AND column_name = 'role_mapping'
  ) THEN
    RAISE EXCEPTION '구형 pg_signing_templates(role_mapping 보유)가 public 에 살아 있다 — '
      '이 DB 에는 v0.4.37.0 드랍이 적용되지 않았다. 중단하고 상태를 보고할 것.';
  END IF;
END $$;

-- 락 규모: `bids` ACCESS EXCLUSIVE 에 더해, CREATE TABLE 의 FK 가 workspaces·users
-- 에 SHARE ROW EXCLUSIVE 를 잡는다 — 로그인/가입/워크스페이스 쓰기와 충돌한다.
-- lock_timeout 은 **대기 1회당** 한도라 최악에는 구문 수만큼 누적된다(수 초 단위).
-- 빨리 실패하고 한산할 때 다시 돌리는 편이 낫다. (드랍 스크립트와 같은 이유.)
SET LOCAL lock_timeout = '3s';

-- 신형 템플릿 표 — lib/db/schema/pg-signing-templates.ts 와 1:1.
-- 제약·인덱스 이름은 drizzle 생성명과 정확히 일치시킨다 (db:push no-op 조건).
CREATE TABLE IF NOT EXISTS pg_signing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL
    CONSTRAINT pg_signing_templates_workspace_id_workspaces_id_fk
    REFERENCES workspaces(id) ON DELETE CASCADE,
  snowsign_template_id text NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL
    CONSTRAINT pg_signing_templates_created_by_users_id_fk
    REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pg_signing_templates_ws_template_uniq
  ON pg_signing_templates (workspace_id, snowsign_template_id);

CREATE INDEX IF NOT EXISTS pg_signing_templates_ws_idx
  ON pg_signing_templates (workspace_id);

-- 견적별 사전 선택 컬럼 — lib/db/schema/bids.ts 와 1:1. 템플릿 삭제 시 사전 선택만
-- 풀린다(SET NULL). 주의: ADD COLUMN IF NOT EXISTS 는 컬럼이 이미 있으면 구문
-- **전체**를 건너뛴다 — 제약도 함께 건너뛰므로, 컬럼만 있고 FK 가 없는 부분 상태
-- (수작업 추가·실패한 push 잔재)는 재실행으로 낫지 않는다. 아래 DO 블록이 그
-- 구멍을 메운다(FK 없이 두면 템플릿 삭제가 SET NULL 대신 dangling 참조를 남긴다).
ALTER TABLE bids ADD COLUMN IF NOT EXISTS signing_template_id uuid
  CONSTRAINT bids_signing_template_id_pg_signing_templates_id_fk
  REFERENCES pg_signing_templates(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bids_signing_template_id_pg_signing_templates_id_fk'
  ) THEN
    ALTER TABLE bids
      ADD CONSTRAINT bids_signing_template_id_pg_signing_templates_id_fk
      FOREIGN KEY (signing_template_id)
      REFERENCES pg_signing_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bids_signing_template_idx
  ON bids (signing_template_id)
  WHERE signing_template_id IS NOT NULL;

COMMIT;
