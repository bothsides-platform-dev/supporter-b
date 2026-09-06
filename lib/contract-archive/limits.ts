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
/**
 * 보관 문서 다운로드 presigned GET 의 수명 — `/api/files/{id}` 와 같은 15분.
 * 짧게 두는 이유는 302 링크가 복사·공유될 수 있어서다(ACL 은 매 요청 재검증하지만
 * 이미 발급된 URL 은 TTL 동안 그 자체로 유효하다).
 */
export const ARCHIVE_DOWNLOAD_TTL_SECONDS = 900;
