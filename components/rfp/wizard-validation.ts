// components/rfp/wizard-validation.ts
//
// 신규 견적 요청 wizard의 단일 검증 소스. 각 step은 자기 입력값만 보고
// 독립적으로 complete 여부를 판정한다(순서 무관). Sidebar·ProgressBar·발송
// 버튼이 모두 이 함수를 통해 동일한 기준으로 step 상태를 본다.
// 필드별 판정은 lib/rfp/required-fields(SSOT)를 공유한다.
import { WIZARD_STEPS } from './wizard-steps';
import {
  isTitleValid,
  isWebsiteValid,
  isPaymentValid,
  isPgValid,
  isDeadlineValid,
  isContractTypeValid,
  isMainProductsValid,
  isAnnualPgVolumeValid,
} from '@/lib/rfp/required-fields';

export type WizardValidationDraft = {
  title: string;
  websiteUrl: string;
  contractType: 'new' | 'renewal' | null | undefined;
  mainProducts: string;
  annualPgVolume: string;
  requiredPaymentMethods: readonly unknown[];
  customPaymentMethods: readonly unknown[];
  allowedPgWorkspaceIds: readonly unknown[];
  deadline: string;
};

export type StepValidity = { num: number; complete: boolean; hint: string };

function isStepComplete(num: number, draft: WizardValidationDraft): boolean {
  switch (num) {
    case 2:
      return (
        isTitleValid(draft.title) &&
        isWebsiteValid(draft.websiteUrl) &&
        isContractTypeValid(draft.contractType) &&
        isMainProductsValid(draft.mainProducts) &&
        isAnnualPgVolumeValid(draft.annualPgVolume) &&
        isPaymentValid(draft.requiredPaymentMethods, draft.customPaymentMethods)
      );
    case 3:
      return isPgValid(draft.allowedPgWorkspaceIds);
    case 4:
      return isDeadlineValid(draft.deadline);
    default:
      // Step 1(사업자 확인)은 필수 입력이 없으므로 항상 complete.
      return true;
  }
}

// step별 미충족 사유 안내. Step 2는 제목 → 홈페이지 → 견적 유형 →
// 주요 판매 상품 → 연간 거래액 → 결제수단 순으로 분기.
function hintFor(num: number, draft: WizardValidationDraft): string {
  switch (num) {
    case 2:
      if (!isTitleValid(draft.title)) return '제목을 입력해주세요';
      if (draft.websiteUrl.trim() === '') return '홈페이지 주소를 입력해주세요';
      if (!isWebsiteValid(draft.websiteUrl)) return '홈페이지 주소 형식을 확인해주세요';
      if (!isContractTypeValid(draft.contractType)) return '견적 유형을 선택해주세요';
      if (!isMainProductsValid(draft.mainProducts)) return '주요 판매 상품을 입력해주세요';
      if (!isAnnualPgVolumeValid(draft.annualPgVolume)) return '전년도 연간 PG 총 거래액을 입력해주세요';
      return '견적 받을 결제수단을 1개 이상 선택해주세요';
    case 3:
      return 'PG를 1개 이상 선택해주세요';
    case 4:
      return '마감일을 선택해주세요';
    default:
      return '';
  }
}

export function getWizardValidity(draft: WizardValidationDraft): StepValidity[] {
  return WIZARD_STEPS.map(({ num }) => ({
    num,
    complete: isStepComplete(num, draft),
    hint: hintFor(num, draft),
  }));
}

export function getFirstIncompleteStep(draft: WizardValidationDraft): StepValidity | null {
  return getWizardValidity(draft).find((s) => !s.complete) ?? null;
}
