export const BID_WIZARD_STEPS = [
  { num: 1, label: '정산 조건' },
  { num: 2, label: '수수료' },
  { num: 3, label: '견적서' },
  { num: 4, label: '검토·발송' },
] as const;

export type BidWizardStep = (typeof BID_WIZARD_STEPS)[number];

// 서버 거부코드 → 그 원인이 있는 단계. 없으면 step4(검토)에서 일반 메시지.
// (UI상 정상 발생 불가한 PAYMENT_METHOD_NOT_REQUESTED 도 변조·직접호출 안전망으로 매핑.)
// 주의: 거부 문구(submitError)는 4단계 검토 화면에서만 렌더된다 — 여기서 다른
// 단계로 매핑하면 사용자는 그 단계로 점프하되 **이유를 못 본다**. 원인 자리로
// 데려가는 값이 문구를 잃는 값보다 클 때만 매핑한다.
export const SERVER_ERROR_STEP: Record<string, number> = {
  PAYMENT_METHOD_NOT_REQUESTED: 2,
  INVALID_ATTACHMENT: 3,
};
