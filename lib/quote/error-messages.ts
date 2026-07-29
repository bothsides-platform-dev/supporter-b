// 견적 템플릿 액션 에러 코드 → 사용자용 한글 메시지(단일 출처, SSOT).
//
// 서버 액션은 { ok:false, error:'CODE' } 를 돌려주지만 raw 코드를 사용자에게 보이면
// 안 된다 — 특히 requirePgWorkspace 는 세션 실패를 'FORBIDDEN_PG' 같은 Error message
// 로 그대로 흘려보낸다(lib/server/actions/quote-template/_shared.ts). 매핑에 없는 코드는
// fallback 으로 흡수한다. lib/signing/error-messages.ts 와 같은 계약.
//
// 순수 함수 — 클라·서버 공용이므로 server-only import 금지.

import { MAX_QUOTE_TEMPLATES } from './limits';

const MESSAGES: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해 주세요.',
  LIMIT_REACHED: `템플릿은 최대 ${MAX_QUOTE_TEMPLATES}개까지 저장할 수 있어요.`,
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없어요.',
  FORBIDDEN: '권한이 없어요.',
  FORBIDDEN_PG: '권한이 없어요.',
};

const GENERIC = '잠시 후 다시 시도해 주세요.';

/**
 * 견적 템플릿 에러 코드를 한글 메시지로 옮긴다. 알려지지 않은 코드·undefined 는
 * fallback(호출 문맥 문구, 예: "템플릿을 복제하지 못했어요")을 쓰고, 그것도 없으면
 * 일반 안내를 반환한다. **raw 코드는 절대 노출하지 않는다.**
 */
export function quoteTemplateErrorMessage(code?: string, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? GENERIC;
}
