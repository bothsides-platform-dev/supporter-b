-- 계약 보관함 + 발송 문서 스냅샷 + 대기 알림 이벤트 — 새 코드 배포 **전에** 실행
--
-- 이 릴리스는 스키마를 세 군데 건드린다:
--   1) `contract_archives`          — 신규 표(+인덱스·CHECK). 완료본·감사추적인증서
--                                     R2 사본과 수동 업로드 계약서를 담는다.
--   2) `signing_contracts.sent_document` — 신규 jsonb. 조항형 발송 시점의 문서 스냅샷.
--   3) `outbox_event` enum 에 `signing.awaiting_template` 추가 — 선정~발송 구간 메일.
--
-- ⚠️ **왜 `pnpm db:push` 가 아니라 이 파일인가.**
-- `scripts/deploy/lightsail-deploy.sh` 는 `git pull --ff-only` 를 **자기 안에서** 한다.
-- 그러니 배포 전에 `db:push` 를 돌리면 drizzle-kit 이 **옛 스키마 파일**을 읽는다:
--   · `contract_archives` 는 만들어지지 않는데 계획서는 "변경 없음"이라 **거짓 초록**이다
--     (v0.4.42.0 사고와 같은 모양).
--   · 더 나쁜 건 enum 이다. 아래 3)을 psql 로 먼저 넣어 두면, 옛 스키마와의 diff 가
--     그 값을 **되돌리는** 계획을 짠다 — 실측된 계획:
--         ALTER TABLE outbox_entries ALTER COLUMN event SET DATA TYPE text;
--         DROP TYPE public.outbox_event;
--         CREATE TYPE public.outbox_event AS ENUM(<새 값 없이>);
--         ALTER TABLE outbox_entries ALTER COLUMN event SET DATA TYPE public.outbox_event USING …
--     그대로 돌면 `onAward` 알림이 다시 깨지고, 이미 그 값을 쓴 행이 있으면 USING 캐스트가
--     실패한다.
-- 앞선 두 서명 릴리스가 `psql -f docs/migrations/*.sql` 을 쓴 이유가 이것이다 — pull 을
-- 안 했으면 **시끄럽게 실패**한다. 인라인 `psql -c` + `db:push` 조합은 그 강제력을 없앤다.
--
-- 구코드에는 무해하다: 신규 표는 구코드가 아예 모르고, `sent_document` 는 구코드가
-- SELECT 하지 않으며(신코드만 명시 projection 에 넣는다), enum 새 값은 구코드가
-- 보내지 않는다.
--
-- 실행 순서:
--   1) 이 스크립트 실행 (배포 전, 구코드가 도는 중에 안전)
--   2) `bash scripts/deploy/lightsail-deploy.sh`
--
-- 롤백: 코드를 되돌리면 신규 표·컬럼은 그대로 둬도 무해하다(구코드가 안 본다).
-- enum 값은 Postgres 에 `ALTER TYPE … DROP VALUE` 가 없어 되돌릴 수 없다 — 그래서
-- 되돌릴 필요가 없도록 additive 로만 넣는다.

\set ON_ERROR_STOP on

-- ── 1) contract_archives ────────────────────────────────────────────────────
BEGIN;

-- lock_timeout 만으로는 부족하다 — 락을 **잡은 뒤** 도는 스캔 시간은 제한되지 않는다.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS contract_archives (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source              text NOT NULL,
  -- SET NULL 이 핵심이다: RFP 삭제가 signing_contracts 를 CASCADE 로 지워도 보관함
  -- 행은 스냅샷(제목·상대방·견적번호·체결일)을 들고 홀로 선다.
  signing_contract_id uuid REFERENCES signing_contracts(id) ON DELETE SET NULL,
  rfp_code            text,
  title               text NOT NULL,
  counterparty_name   text,
  contracted_at       timestamptz,
  status              text NOT NULL DEFAULT 'pending',
  document_key        text,
  document_name       text,
  document_size       integer,
  audit_key           text,
  audit_name          text,
  attempts            integer NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_archives_source_check CHECK (source in ('signing','upload')),
  CONSTRAINT contract_archives_status_check CHECK (status in ('pending','ready','failed'))
);

-- 자동 보관 멱등의 근거 — 완료 전이 직후 훅과 cron 백필이 겹쳐도 무해하다.
CREATE UNIQUE INDEX IF NOT EXISTS contract_archives_ws_signing_uniq
  ON contract_archives (workspace_id, signing_contract_id)
  WHERE signing_contract_id IS NOT NULL;

-- 목록 조회.
CREATE INDEX IF NOT EXISTS contract_archives_ws_created_idx
  ON contract_archives (workspace_id, created_at);

-- pending 처리(하이드레이션·스윕)용 부분 인덱스.
CREATE INDEX IF NOT EXISTS contract_archives_pending_idx
  ON contract_archives (created_at)
  WHERE status = 'pending';

-- signing_contract_id 단독 조회용. 위 복합 유니크는 workspace_id 가 선두라
-- 이 컬럼만으로 하는 동등 조회를 못 받는다. 세 소비자가 이걸 쓴다:
--   · markSigningReady / recordSigningAttempt / markSigningFailed (WHERE signing_contract_id = $1)
--   · 백필의 LEFT JOIN anti-join (2분마다, 정상 상태에서 0행이어도 매번)
--   · ON DELETE SET NULL 강제 스캔 — Postgres 는 참조 컬럼을 자동 인덱싱하지 않는다.
CREATE INDEX IF NOT EXISTS contract_archives_signing_idx
  ON contract_archives (signing_contract_id);

COMMIT;

-- ── 2) signing_contracts.sent_document ──────────────────────────────────────
BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- PG >= 11 에서 DEFAULT 없는 ADD COLUMN 은 카탈로그만 바꾼다(테이블 재작성 없음).
-- 그래도 ACCESS EXCLUSIVE 를 잡으므로 lock_timeout 없이 돌리면 긴 트랜잭션 뒤에
-- 줄서서 signing_contracts 의 모든 읽기·쓰기(딜룸 계약 탭·폴러·웹훅)를 막는다.
ALTER TABLE signing_contracts
  ADD COLUMN IF NOT EXISTS sent_document jsonb;

COMMIT;

-- ── 3) outbox_event enum ────────────────────────────────────────────────────
-- ⚠️ 트랜잭션 밖에서 돈다. `ALTER TYPE … ADD VALUE` 는 같은 트랜잭션 안에서 그 값을
-- 쓸 수 없고(PG 12+ 에서도), 구버전에서는 트랜잭션 블록 자체가 금지다.
-- 운영은 PG 16 이라 IF NOT EXISTS 를 쓸 수 있어 재실행이 안전하다.
ALTER TYPE outbox_event ADD VALUE IF NOT EXISTS 'signing.awaiting_template';

-- ── 검증 ────────────────────────────────────────────────────────────────────
-- 적용 후 아래가 모두 참이어야 한다:
--   \d contract_archives            → 표 + 인덱스 4개 + CHECK 2개
--   \d signing_contracts            → sent_document jsonb
--   SELECT unnest(enum_range(NULL::outbox_event));  → signing.awaiting_template 포함
