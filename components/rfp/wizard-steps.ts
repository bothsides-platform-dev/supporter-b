export const WIZARD_STEPS = [
  { num: 1, label: '사업자 확인' },
  { num: 2, label: '견적 내용' },
  { num: 3, label: 'PG 선택' },
  { num: 4, label: '최종 견적 요청 정보 확인' },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];
export const STEP_LABELS = WIZARD_STEPS.map((s) => s.label) as [string, string, string, string];
