import { ARCHIVE_UPLOAD_CAP_PER_WORKSPACE, MAX_ARCHIVE_DOC_BYTES } from './limits';

const MB = Math.floor(MAX_ARCHIVE_DOC_BYTES / (1024 * 1024));

/**
 * 서버 오류코드 → 사용자 문구. `lib/quote/error-messages` 미러.
 *
 * 코드마다 **사용자가 취할 행동이 다르다** — 그래서 한 문구로 뭉뚱그리지 않는다.
 * 상한 초과는 지우라는 말이고, 형식 오류는 파일을 바꾸라는 말이다.
 *
 * ⚠️ 키는 라우트·서비스가 실제로 내는 코드여야 한다. `app/api/contract-archives/**`
 * 의 `fail(...)` 인자와 `ContractArchiveService` 의 `error` 값이 유일한 출처다 —
 * 여기에 없는 코드는 fallback 문구로 떨어진다(조용히 틀린 문구를 내지는 않는다).
 */
const MESSAGES: Record<string, string> = {
  // presign
  UPLOAD_LIMIT: `직접 올린 계약서가 ${ARCHIVE_UPLOAD_CAP_PER_WORKSPACE}건을 넘었어요. 오래된 것을 지우고 다시 시도해 주세요.`,
  FILE_TOO_LARGE: `PDF는 ${MB}MB까지 올릴 수 있어요.`,
  PRESIGN_FAILED: '파일 올리기를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.',
  // 전송
  UPLOAD_TRANSFER_FAILED: '파일을 올리지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.',
  // complete
  MIME_MISMATCH: 'PDF 파일만 올릴 수 있어요.',
  SIZE_MISMATCH: '올린 파일이 처음 고른 파일과 달라요. 다시 시도해 주세요.',
  NOT_UPLOADED: '파일이 아직 다 올라가지 않았어요. 다시 시도해 주세요.',
  INVALID_STATE: '보관하지 못했어요. 잠시 후 다시 시도해 주세요.',
  // 다운로드
  INVALID_DOC: '요청한 문서 종류를 알 수 없어요.',
  // 공통
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요.',
  INVALID_JSON: '요청을 처리하지 못했어요. 다시 시도해 주세요.',
  NOT_FOUND: '계약서를 찾을 수 없어요.',
  FORBIDDEN: '권한이 없어요.',
  FORBIDDEN_PG: '워크스페이스 승인 후 이용할 수 있어요.',
  UNAUTHENTICATED: '다시 로그인해 주세요.',
  // 서비스
  ARCHIVE_NOT_DELETABLE: '전자서명으로 보관된 계약서는 지울 수 없어요.',
  ARCHIVE_NOT_READY: '아직 보관 준비 중이에요. 잠시 후 다시 시도해 주세요.',
  ARCHIVE_DOC_NOT_FOUND: '그 문서는 이 계약서에 없어요.',
};

export function contractArchiveErrorMessage(code: string, fallback: string): string {
  return MESSAGES[code] ?? fallback;
}
