export const BID_WIZARD_STEPS = [
  { num: 1, label: '정산 조건' },
  { num: 2, label: '수수료' },
  { num: 3, label: '견적서' },
  { num: 4, label: '검토·발송' },
] as const;

export type BidWizardStep = (typeof BID_WIZARD_STEPS)[number];

// 서버 거부코드 → 그 원인이 있는 단계. 없으면 step4(검토)에서 일반 메시지.
// (UI상 정상 발생 불가한 PAYMENT_METHOD_NOT_REQUESTED 도 변조·직접호출 안전망으로 매핑.)
export const SERVER_ERROR_STEP: Record<string, number> = {
  PAYMENT_METHOD_NOT_REQUESTED: 2,
  INVALID_ATTACHMENT: 3,
};
