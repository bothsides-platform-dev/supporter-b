// components/rfp/wizard-validation.ts
//
// 신규 견적 요청 wizard 의 단계 상태. 각 step 은 자기 입력값만 보고 독립적으로
// complete 여부를 판정한다(순서 무관). Sidebar·ProgressBar·발송 버튼이 모두 이
// 함수를 통해 동일한 기준으로 step 상태를 본다. 판정 자체는 발송 가능 판정
// (lib/rfp/send-readiness)이 소유하고, 여기서는 단계별로 묶어 첫 미충족 안내만 고른다.
import { WIZARD_STEPS } from './wizard-steps';
import { sendReadinessIssues, type SendReadinessInput } from '@/lib/rfp/send-readiness';

export type WizardValidationDraft = SendReadinessInput;

export type StepValidity = { num: number; complete: boolean; hint: string };

/**
 * 단계 게이트는 묶음 화면(RfpStep2Content — 랜딩·튜토리얼)이 받는 입력만 본다.
 * 질문 흐름 전용 입력(판매 정보·현재 PG)은 RfpCreateWizard 가 회원 작성에서
 * contentQuestions 로 덧붙인다.
 */
export function getWizardValidity(draft: WizardValidationDraft, groups?: readonly { id: string }[]): StepValidity[] {
  const issues = sendReadinessIssues(draft, groups).filter((issue) => !issue.questionFlowOnly);
  return WIZARD_STEPS.map(({ num }) => {
    const first = issues.find((issue) => issue.step === num);
    return { num, complete: first === undefined, hint: first?.message ?? '' };
  });
}

export function getFirstIncompleteStep(draft: WizardValidationDraft, groups?: readonly { id: string }[]): StepValidity | null {
  return getWizardValidity(draft, groups).find((s) => !s.complete) ?? null;
}
