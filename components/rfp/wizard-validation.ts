// components/rfp/wizard-validation.ts
//
// 신규 제안 요청 wizard의 단일 검증 소스. 각 step은 자기 입력값만 보고
// 독립적으로 complete 여부를 판정한다(순서 무관). Sidebar·ProgressBar·발송
// 버튼이 모두 이 함수를 통해 동일한 기준으로 step 상태를 본다.
import { WIZARD_STEPS } from './wizard-steps';

export type WizardValidationDraft = {
  title: string;
  allowedPgWorkspaceIds: readonly unknown[];
  deadline: string;
};

export type StepValidity = { num: number; complete: boolean; hint: string };

const HINTS: Record<number, string> = {
  2: '제목을 입력해주세요',
  3: 'PG를 1개 이상 선택해주세요',
  4: '마감일을 선택해주세요',
};

function isStepComplete(num: number, draft: WizardValidationDraft): boolean {
  switch (num) {
    case 2:
      return draft.title.trim() !== '';
    case 3:
      return draft.allowedPgWorkspaceIds.length > 0;
    case 4:
      return draft.deadline !== '' && !Number.isNaN(new Date(draft.deadline).getTime());
    default:
      // Step 1(사업자 확인)은 필수 입력이 없으므로 항상 complete.
      return true;
  }
}

export function getWizardValidity(draft: WizardValidationDraft): StepValidity[] {
  return WIZARD_STEPS.map(({ num }) => ({
    num,
    complete: isStepComplete(num, draft),
    hint: HINTS[num] ?? '',
  }));
}

export function getFirstIncompleteStep(draft: WizardValidationDraft): StepValidity | null {
  return getWizardValidity(draft).find((s) => !s.complete) ?? null;
}
