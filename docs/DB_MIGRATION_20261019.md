# 2026-10-19 운영 DB 적용 기록

2026-10-19 03:30 KST에 운영 `supporter_b` DB(PostgreSQL 16.14)에 아래 SQL을 순서대로 적용했다. 각 파일의 트랜잭션은 모두 COMMIT됐고, 03:30:29 KST에 카탈로그 검증을 완료했다.

적용 소스 커밋: `2883bb055f0d701f7801c63336b019636f80e0ec` (`fix/calendar-closed-checks`).

| SQL | SHA-256 |
|---|---|
| `20261018-phone-otp-proof.sql` | `9e7dd016beb46b37a7d024e7ad6043bda10b654429da7e416e74fd0511fffbf1` |
| `20261018-upload-workspace.sql` | `a268403bb816742dfb22dec23de9fb231448df3911eb85be99afa189e4da20fa` |
| `20261019-calendar-closed-checks.sql` | `aa4be1da509cb6e7ea66778d535b1b92be8b593815d8d3052276903d069b76d9` |

## 백업과 사전 확인

운영 서버 `/home/ec2-user/db-migrations/20261019-calendar-closed-checks/`에 전체 custom-format `backup.dump`(364,803 bytes), `backup.list`, `schema-before.sql`, `backup-sha256.txt`, 적용 SQL·체크섬·커밋, `preflight.log`, 파일별 적용 로그·완료 시각, `verification.log`, `schema-after.sql`을 보관했다. 디렉터리 권한은 700, 백업 파일은 600이다. `pg_restore --list` 읽기와 백업·전송 SQL 체크섬 검증은 통과했다. 별도 DB로의 복원 리허설은 실행하지 않았다.

적용 전에 대상 enum·컬럼 5개·CHECK 2개의 부재를 다시 확인했다. 예외·감사 테이블은 각각 0행, 잘못된 `closed` 값과 30초 이상 열린 다른 트랜잭션은 0건이었다. 2026·2027년 달력 행은 존재했다. `psql -X -v ON_ERROR_STOP=1`, 연결별 `lock_timeout=3s`, `statement_timeout=30s`를 사용했다.

## 적용 후 확인

- `phone_otp_purpose` 값과 순서: `signup`, `profile_phone_update`.
- `phone_otps.purpose`: 해당 enum, `user_id`: uuid, `proof_expires_at`·`consumed_at`: timestamptz.
- `attachments.upload_workspace_id`: uuid.
- 추가 컬럼 5개 모두 nullable, 기본값 없음. SQL에서 기존 행을 백필하지 않았다.
- 두 달력 CHECK 모두 `CHECK ((closed = ANY (ARRAY[0, 1])))`, `convalidated=true`. 예외·감사 테이블은 각각 0행을 유지했다.
- 적용 전후 스키마 diff는 위 enum·컬럼·CHECK 추가와 pg_dump의 실행별 restrict 토큰 차이뿐이었다.

관련 마이그레이션 테스트 9개와 타입 검사·린트가 통과했다. 전체 `pnpm test`도 865개 파일·8,785개 테스트가 통과했다(1개 파일·3개 테스트 skipped, 200.20초). Node deprecation/experimental 경고와 오류 경로 테스트의 애플리케이션 로그는 있었으나 테스트 실패는 없었다. 새 회귀 테스트는 잘못된 정수 거부, 0·1 허용, 기존 행 보존, 재실행, 정의 충돌·잘못된 기존 값의 원자 중단, 미검증 제약 검증, Drizzle 생성 스키마와의 일치를 확인한다.

## 앱 배포 인계

앱 배포·재시작은 실행하지 않았다. 서버 체크아웃은 전후 모두 `04218f2b81871c73ac27d34fc653c0b4499e4733`이었다. 새 코드의 DB 선행 조건은 충족됐으며, 다음 배포에 달력 스키마 보완 커밋을 포함해야 향후 스키마 동기화가 CHECK를 제거하지 않는다. 배포 절차는 [배포 런북](DEPLOY_LIGHTSAIL.md)을 따른다. 롤백 때 추가 구조는 유지한다.

과거 선정 완료 칸반 열 정리, 계약 템플릿·샘플 데이터 삭제 SQL, 기존 업종·수수료 데이터 변환은 실행하지 않았다.
