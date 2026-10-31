# PG 업무 화면 PR 스크린샷

격리된 로컬 테스트 DB의 가상 구매사·요청 데이터로 촬영했습니다.

- `pg-inbox-1440.png`: 205건 요청 테이블
- `pg-preview-1280.png`: 목록 옆 선택 요청 미리보기
- `pg-preview-390.png`: 좁은 화면의 요청 미리보기
- `pg-submitted-1440.png`: 견적 발송 후 구매사 검토 대기

재현: `E2E_WEBPACK=1 pnpm exec playwright test e2e/pg-workspace-v2.spec.ts e2e/scenario-b-pg-bid.spec.ts --grep '205건|1440px'`
