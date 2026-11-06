export type BidDraft = {
  __v: 3 | 4;
  currentStep?: number;
  baseBidId?: string;
  expectedRequoteDeadline?: string;
  conditionStates?: Record<string, import('./terms').ConditionState>;
  legacyZeroReviewed?: boolean;
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  // key: PaymentMethod | customId, value: 사용자가 입력한 "%" 문자열
  fees: Record<string, string>;
  memo: string;
  proposalChoice?: 'keep' | 'replace' | 'remove';
  uploadedProposal?: { id: string; name: string; size: number };
  /**
   * 계약서 템플릿 선택(선택적, __v 3 후기 추가 — signupFee 처럼 부재 시 무해).
   * 초안에 안 실리면 "그대로 불러왔어요" 복원 뒤 제출이 NULL 로 나간다(M23).
   */
  signingTemplateId?: string;
};

export const EMPTY_BID_DRAFT: BidDraft = {
  __v: 4,
  cycleUnit: 'D',
  cycleNum: '1',
  // 정산한도는 0 초과 필수라 '0' 프리필은 사용자가 먼저 지워야 하는 무효값이다.
  // 빈 값으로 두면 placeholder 가 보이고 필수 마커도 '미입력'으로 정직해진다.
  settleLimit: '',
  guaranteeInsurance: '',
  signupFee: '',
  fees: {},
  memo: '',
};
