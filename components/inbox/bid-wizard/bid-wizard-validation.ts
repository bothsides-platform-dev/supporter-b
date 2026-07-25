// components/inbox/bid-wizard/bid-wizard-validation.ts
//
// 견적 작성 wizard 단일 검증 소스. 구매사 wizard-validation.ts 미러.
// step1=정산주기, step2=수수료1개+. step3(견적서)·step4(검토)는 선택/요약이라 항상 complete.
import { BID_WIZARD_STEPS } from './bid-wizard-steps';
import { MERCHANT_TIERS, isTieredMethod, type PaymentMethod } from '@/lib/types/bid';

export type BidValidationInput = {
  cycleNum: string;
  settleLimit: string;
  anyFeeFilled: boolean;
};

export type BidStepValidity = { num: number; complete: boolean; hint: string };

const HINTS: Record<number, string> = {
  1: '정산 주기와 정산한도를 입력해주세요',
  2: '수수료를 1칸 이상 입력해주세요',
};

export function isCycleValid(cycleNum: string): boolean {
  return cycleNum !== '' && parseInt(cycleNum) > 0;
}

/**
 * 정산한도는 0 초과만 유효하다. 0 은 '한도 없음'이 아니라 '정산 불가'로 읽히는데,
 * 구매사 비교 패널은 저장된 값을 그대로 `0원` 으로 찍기 때문에 그 오해가 그대로
 * 노출된다. 컬럼이 `NOT NULL DEFAULT '0'` 이라 미입력과 진짜 0 이 저장 시점에
 * 구분되지 않으므로, 입력 단계에서 0 자체를 막는 것이 유일한 구분 지점이다.
 * 프론트 전용 게이트다 — 서버 스키마는 건드리지 않는다.
 */
export function isSettleLimitValid(settleLimit: string): boolean {
  return settleLimit !== '' && parseFloat(settleLimit) > 0;
}

/**
 * "수수료 1칸 이상 입력" 판정의 단일 출처 — BidWizard의 anyFeeFilled 파생과
 * 픽스처 검증 테스트가 공유한다(재구현 드리프트 방지). fees 키 규약:
 * 구간제 수단은 `"<method>:<tier>"`, 정액/정률 단일 수단·커스텀은 그대로.
 */
/**
 * 수수료 칸 하나가 "채워졌다"의 단일 판정. 진행률 표시(BidStepFees)와 제출 가능
 * 판정(deriveAnyFeeFilled)이 공유한다 — 기준이 갈리면 진행률 100% 인데 제출은
 * 막히는 어긋남이 난다. 0 은 유효(무료 수수료 제안), 음수·빈칸은 미입력.
 */
export function isFeeFilled(fees: Record<string, string>, key: string): boolean {
  return (fees[key] ?? '') !== '' && parseFloat(fees[key]) >= 0;
}

export function deriveAnyFeeFilled(
  fees: Record<string, string>,
  feeInputMethods: readonly PaymentMethod[],
  customPaymentMethods: readonly { id: string }[],
): boolean {
  const feeFilled = (key: string) => isFeeFilled(fees, key);
  const anyTieredFilled = feeInputMethods.some(
    (m) => isTieredMethod(m) && MERCHANT_TIERS.some((t) => feeFilled(`${m}:${t}`)),
  );
  const anySingleFilled =
    feeInputMethods.some((m) => !isTieredMethod(m) && feeFilled(m)) ||
    customPaymentMethods.some((c) => feeFilled(c.id));
  return anyTieredFilled || anySingleFilled;
}

function isStepComplete(num: number, input: BidValidationInput): boolean {
  switch (num) {
    case 1:
      return isCycleValid(input.cycleNum) && isSettleLimitValid(input.settleLimit);
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
