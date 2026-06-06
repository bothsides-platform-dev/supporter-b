export const BID_WIZARD_STEPS = [
  { num: 1, label: '정산 조건' },
  { num: 2, label: '수수료' },
  { num: 3, label: '견적서' },
  { num: 4, label: '검토·발송' },
] as const;

export type BidWizardStep = (typeof BID_WIZARD_STEPS)[number];
