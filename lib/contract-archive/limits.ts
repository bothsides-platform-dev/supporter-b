/** 보관 문서(완료본/인증서/업로드) 1개당 최대 바이트 — 30MB. */
export const MAX_ARCHIVE_DOC_BYTES = 30 * 1024 * 1024;
/** cron 1회당 하이드레이션할 계약 수 — provider rate limit 예산. */
export const HYDRATE_BUDGET_PER_RUN = 3;
/** cron 1회당 백필 행 생성 계약 수 — DB insert 뿐이라 예산이 크다. */
export const BACKFILL_BUDGET_PER_RUN = 10;
/** 이 횟수 실패하면 failed 로 보내고 재시도를 멈춘다(다른 건 굶기기 방지). */
export const MAX_HYDRATE_ATTEMPTS = 10;
/** 워크스페이스당 수동 업로드 행 상한 — 남용 캡. */
export const ARCHIVE_UPLOAD_CAP_PER_WORKSPACE = 200;
