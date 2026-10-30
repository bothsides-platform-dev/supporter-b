import { errorLabel } from "@/lib/utils/error-label";

const ERROR_LABELS: Record<string, string> = {
  NETWORK_ERROR:
    "발송 결과를 확인하지 못했어요. 새로고침해 보낸 견적을 확인한 뒤 다시 시도해요. 입력한 내용은 유지해요.",
  FORBIDDEN_PG: "PG 사용자 권한이 필요합니다.",
  FORBIDDEN: "이 견적 요청에 견적을 보낼 권한이 없어요.",
  // 정산한도를 지목한다 — v0.4.34.0 이 `submitBidAction` 의 하한을 `.gt(0)` 으로
  // 조여서, 클라 게이트를 우회한 제출이 이 코드로 돌아온다. 사용자는 검토(4단계)
  // 화면을 보고 있고 원인은 1단계 칸이라 어느 칸인지 말해 주지 않으면 못 고친다.
  // 템플릿 저장 경로(`lib/quote/error-messages.ts`)와 같은 문구다.
  INVALID_INPUT: "입력 값을 확인해 주세요. 정산한도는 0보다 커야 해요.",
  RFP_NOT_FOUND: "견적 요청을 찾을 수 없어요.",
  RFP_NOT_OPEN: "마감됐거나 이미 종료된 견적 요청이에요.",
  INVITATION_NOT_FOUND: "초대 내역을 찾을 수 없어요.",
  BID_ALREADY_SUBMITTED: "이미 견적을 보냈어요.",
  PAYMENT_METHOD_NOT_REQUESTED: "구매사가 요청하지 않은 결제수단입니다.",
  INVALID_ATTACHMENT: "첨부한 견적서를 확인할 수 없어요. 다시 올려주세요.",
  INVALID_SIGNING_TEMPLATE: "고른 계약서를 쓸 수 없어요. 다시 골라주세요.",
  REQUOTE_CHANGED:
    "수정 요청 내용이 바뀌었어요. 화면을 새로고침한 뒤 다시 제출해 주세요.",
};

export function bidSubmitErrorMessage(error: string): string {
  return errorLabel(
    ERROR_LABELS,
    error,
    "견적을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  );
}
