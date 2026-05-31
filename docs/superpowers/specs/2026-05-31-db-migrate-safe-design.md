# db-migrate-safe: 마이그레이션 baseline 자동 복구 설계

**날짜**: 2026-05-31  
**상태**: 승인됨

## 문제

`drizzle-kit push` 또는 직접 SQL로 스키마를 초기화한 DB에는 `drizzle.__drizzle_migrations`가 비어 있다. 이후 `drizzle-kit migrate`를 실행하면 0000 마이그레이션을 재실행하려다 `CREATE TYPE ... AS ENUM`이 `IF NOT EXISTS` 없이 실행되어 exit code 1로 실패한다.

이 문제는 로컬과 운영 서버(Lightsail deploy.sh) 모두에서 발생한다.

## 해결 방향

`drizzle-kit migrate` 앞에 baseline 체크 레이어를 삽입한다. 래퍼 스크립트(`scripts/db-migrate-safe.mjs`)가 "schema exists but unrecorded" 상태를 감지하면 journal 기반으로 누락된 마이그레이션 레코드를 삽입한 뒤 `drizzle-kit migrate`를 실행한다.

## 래퍼 스크립트 로직

```
db-migrate-safe.mjs 실행
 │
 ├─ DB 접속 (postgres-js, DATABASE_URL)
 │
 ├─ drizzle.__drizzle_migrations 테이블 존재 여부 확인
 │   └─ 없으면 → skip (drizzle-kit migrate가 최초 생성)
 │
 ├─ __drizzle_migrations 행 수 확인
 │   └─ 행이 있으면 → skip (정상 상태, baseline 불필요)
 │
 ├─ public 스키마 테이블 존재 여부 확인 (pg_tables 조회)
 │   └─ 없으면 → skip (새 DB, migrate가 처음 실행되는 정상 케이스)
 │
 ├─ 세 조건 모두 충족 → baseline 삽입
 │   ├─ drizzle/meta/_journal.json 읽기
 │   ├─ 각 entry의 .sql 파일 SHA256 계산 (drizzle-orm/migrator 동일 방식)
 │   └─ INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
 │      journal entry별로 한 행씩 삽입 (이미 있는 hash는 ON CONFLICT DO NOTHING)
 │
 └─ DB 접속 닫기 → execSync('drizzle-kit migrate') 실행
```

## 변경 범위

| 파일 | 변경 |
|---|---|
| `scripts/db-migrate-safe.mjs` | 신규 생성 |
| `package.json` | `db:migrate`: `drizzle-kit migrate` → `node scripts/db-migrate-safe.mjs` |
| `scripts/deploy/lightsail-deploy.sh` | 변경 없음 (`pnpm db:migrate` 호출 유지) |

## 의존성

추가 패키지 없음. `postgres` (이미 존재), Node.js 내장 `crypto` / `fs` / `child_process` 만 사용.

## 테스트 계획 (TDD)

`__tests__/db-migrate-safe.test.ts` — PGlite로 다음 3 시나리오 검증:

1. **baseline 삽입 케이스**: `__drizzle_migrations` 비어 있고 테이블 존재 → 레코드 삽입됨
2. **정상 DB 케이스**: `__drizzle_migrations`에 이미 레코드 있음 → 아무것도 삽입 안 됨
3. **새 DB 케이스**: 테이블 없음 → 아무것도 삽입 안 됨

## 미래 마이그레이션 확장성

journal 전체를 순회하므로 0001, 0002... 추가 시 자동 처리된다. baseline 삽입은 "비어 있는 migrations 테이블 + 테이블 존재" 조건일 때만 동작하므로 정상 운영 DB에는 영향 없다.
