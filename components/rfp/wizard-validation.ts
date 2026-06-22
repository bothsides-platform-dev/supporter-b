// components/rfp/wizard-validation.ts
//
// 신규 제안 요청 wizard의 단일 검증 소스. 각 step은 자기 입력값만 보고
// 독립적으로 complete 여부를 판정한다(순서 무관). Sidebar·ProgressBar·발송
// 버튼이 모두 이 함수를 통해 동일한 기준으로 step 상태를 본다.
import { WIZARD_STEPS } from './wizard-steps';
import { isValidWebsiteUrlLight } from '@/lib/validation/website-url';

export type WizardValidationDraft = {
  title: string;
  websiteUrl: string;
  allowedPgWorkspaceIds: readonly unknown[];
  deadline: string;
  requiredPaymentMethods: readonly unknown[];
  customPaymentMethods: readonly unknown[];
};

export type StepValidity = { num: number; complete: boolean; hint: string };

function hasPaymentMethod(draft: WizardValidationDraft): boolean {
  return draft.requiredPaymentMethods.length + draft.customPaymentMethods.length > 0;
}

function isStepComplete(num: number, draft: WizardValidationDraft): boolean {
  switch (num) {
    case 2:
      // 제목 필수 + 홈페이지(선택)는 비었거나 유효한 도메인 + 결제수단 1개 이상.
      return (
        draft.title.trim() !== '' &&
        isValidWebsiteUrlLight(draft.websiteUrl) &&
        hasPaymentMethod(draft)
      );
    case 3:
      return draft.allowedPgWorkspaceIds.length > 0;
    case 4:
      return draft.deadline !== '' && !Number.isNaN(new Date(draft.deadline).getTime());
    default:
      // Step 1(사업자 확인)은 필수 입력이 없으므로 항상 complete.
      return true;
  }
}

// step별 미충족 사유 안내. Step 2는 제목/홈페이지 중 무엇이 막혔는지에 따라 분기.
function hintFor(num: number, draft: WizardValidationDraft): string {
  switch (num) {
    case 2:
      if (draft.title.trim() === '') return '제목을 입력해주세요';
      if (!isValidWebsiteUrlLight(draft.websiteUrl)) return '홈페이지 주소 형식을 확인해주세요';
      return '결제수단을 1개 이상 선택해주세요';
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
