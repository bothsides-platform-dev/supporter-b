import { errorLabel } from '@/lib/utils/error-label';
import { MATCHING_ERRORS } from '@/lib/rfp/pg-matching';

/**
 * 견적 요청·견적 액션의 실패 코드를 사용자 문구로 바꾼다.
 *
 * 서버 코드를 화면에 그대로 내보내지 않는다(UX_WRITING — 내부 용어·오류 코드 금지).
 * 여기에는 **사용자가 다르게 행동해야 하는 코드만** 둔다. 권한·입력 형식처럼 화면에서
 * 풀 수 없는 코드는 호출처가 넘긴 기본 문구로 떨어진다.
 */
const RFP_ACTION_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: '로그인이 필요해요. 다시 로그인한 뒤 시도해요.',
  RFP_NOT_OPEN: '견적 요청 상태가 바뀌었어요. 새로고침해 최신 상태를 확인해요.',
  RFP_DEADLINE_PASSED: '견적 접수 기간이 끝났어요. 새로고침해 최신 상태를 확인해요.',
  MATCHING_ONLY: MATCHING_ERRORS.MATCHING_ONLY,
  MATCHING_REVIEW_CLOSED: MATCHING_ERRORS.MATCHING_REVIEW_CLOSED,
  WORKSPACES_LIMIT_EXCEEDED: '한 요청에 추가할 수 있는 PG 수를 모두 채웠어요.',
  INVITATION_NOT_DRAFT: 'PG 목록이 바뀌었어요. 새로고침해 최신 상태를 확인해요.',
  ALREADY_AWARDED: '선정이 끝난 요청이에요. 새로고침해 최신 상태를 확인해요.',
  REQUOTE_PENDING: '수정 요청에 응답하는 동안은 견적을 철회할 수 없어요.',
};

/**
 * 상태 전이 실패는 `INVALID_TRANSITION: <내부 사유>` 로 오므로 접두어로 판정한다.
 * 이미 다른 상태가 됐다는 뜻이라 다시 시도해도 풀리지 않는다.
 */
export function rfpActionErrorMessage(code: unknown, fallback: string): string {
  if (typeof code === 'string' && code.startsWith('INVALID_TRANSITION')) {
    return RFP_ACTION_ERRORS.RFP_NOT_OPEN;
  }
  return errorLabel(RFP_ACTION_ERRORS, code, fallback);
}
