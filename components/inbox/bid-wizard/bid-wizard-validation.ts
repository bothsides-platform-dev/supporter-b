// components/inbox/bid-wizard/bid-wizard-validation.ts
//
// 견적 작성 wizard 단일 검증 소스. 구매사 wizard-validation.ts 미러.
// step1=정산주기, step2=수수료1개+. step3(견적서)·step4(검토)는 선택/요약이라 항상 complete.
import { BID_WIZARD_STEPS } from './bid-wizard-steps';

export type BidValidationInput = {
  cycleNum: string;
  anyFeeFilled: boolean;
};

export type BidStepValidity = { num: number; complete: boolean; hint: string };

const HINTS: Record<number, string> = {
  1: '정산 주기를 입력해주세요',
  2: '수수료를 1개 이상 입력해주세요',
};

export function isCycleValid(cycleNum: string): boolean {
  return cycleNum !== '' && parseInt(cycleNum) > 0;
}

function isStepComplete(num: number, input: BidValidationInput): boolean {
  switch (num) {
    case 1:
      return isCycleValid(input.cycleNum);
    case 2:
      return input.anyFeeFilled;
    default:
      return true;
  }
}

export function getBidWizardValidity(input: BidValidationInput): BidStepValidity[] {
  return BID_WIZARD_STEPS.map(({ num }) => ({
    num,
    complete: isStepComplete(num, input),
    hint: HINTS[num] ?? '',
  }));
}

export function getFirstIncompleteBidStep(
  input: BidValidationInput,
): BidStepValidity | null {
  return getBidWizardValidity(input).find((s) => !s.complete) ?? null;
}
