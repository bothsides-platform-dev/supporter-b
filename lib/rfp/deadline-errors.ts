export const DEADLINE_ERROR_MESSAGES: Record<string, string> = {
  FEATURE_UNAVAILABLE: '마감일 변경 기능을 준비 중이에요. 잠시 후 다시 시도해 주세요.',
  CALENDAR_UNAVAILABLE: '영업일 달력을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
  INVALID_TIME: '마감일을 다시 선택해 주세요.',
  NON_BUSINESS_DAY: '한국 영업일을 선택해 주세요.',
  TOO_SOON: '요청일을 제외하고 최소 3영업일 뒤로 선택해 주세요.',
  TOO_LATE: '요청일로부터 30일 안에서 선택해 주세요.',
  HOLIDAY: '한국 영업일을 선택해 주세요.',
  DEADLINE_CHANGED: '다른 변경이 먼저 반영됐어요. 최신 마감일을 확인해 주세요.',
  REVIEW_CHANGED: '상담 상태가 바뀌었어요. 최신 상태를 확인해 주세요.',
  REVIEW_NOT_ACTIVE: '현재 PG사 상담이 종료됐어요. 최신 상태를 확인해 주세요.',
  REOPEN_REQUIRED: '견적 접수 기간이 끝났어요. 화면을 새로고침하고 다시 열어 주세요.',
  RFP_NOT_EXPIRED: '견적 접수 기간이 아직 열려 있어요. 화면을 새로고침해 주세요.',
  ALREADY_OPEN: '견적 접수 기간이 이미 열려 있어요. 화면을 새로고침해 주세요.',
  DEADLINE_NOT_PASSED: '견적 접수 기간이 아직 열려 있어요. 화면을 새로고침해 주세요.',
  MATCHING_BUSY: '상담 상태가 바뀌었어요. 새로고침해 주세요.',
  MATCHING_BID_ARRIVED: '견적이 도착했어요. 받은 견적을 확인해 주세요.',
  BID_ALREADY_SUBMITTED: '견적이 도착했어요. 받은 견적을 확인해 주세요.',
  MATCHING_UNAVAILABLE: '다음 PG사 후보를 다시 확인해 주세요.',
  NO_CANDIDATE: '다음 PG사 후보를 다시 확인해 주세요.',
  DEADLINE_MUST_EXTEND: '현재 마감일보다 늦은 날짜를 선택해 주세요.',
  DEADLINE_NOT_EXTENDED: '현재 가장 늦은 마감일보다 뒤로 선택해 주세요.',
  RFP_NOT_OPEN: '견적 요청 상태가 바뀌었어요. 새로고침해 주세요.',
  RFP_NOT_SENT: '견적 요청 상태가 바뀌었어요. 새로고침해 주세요.',
  INVALID_INPUT: '선택한 마감일을 다시 확인해 주세요.',
  REQUOTE_ALREADY_PENDING: '진행 중인 재요청을 먼저 확인해 주세요.',
};

export function deadlineErrorMessage(code: string): string {
  return DEADLINE_ERROR_MESSAGES[code] ?? '처리하지 못했어요. 화면을 새로고침하고 다시 시도해 주세요.';
}
