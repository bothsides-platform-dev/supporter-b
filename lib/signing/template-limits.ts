// 계약서 템플릿 입력 한도 — 클라이언트 input 캡과 서버 zod 스키마가 같은 값을
// 바라보는 단일 출처. 리터럴을 흩뿌리면 서버만 바뀌었을 때 클라이언트 캡이
// 조용히 어긋나 사용자가 불투명한 서버 거절을 만난다.
export const SIGNING_TEMPLATE_NAME_MAX = 80;
export const SIGNING_TEMPLATE_PDF_MAX_BYTES = 50 * 1024 * 1024;
